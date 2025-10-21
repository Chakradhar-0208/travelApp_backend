import express from "express";
import Trip from "../models/Trip.js";
import upload from "../middlewares/multer.js";
import { v2 as cloudinary } from "cloudinary";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
const router = express.Router();

router.get("/", async (req, res) => { // Ge ts some basic info of all trips 
  try { // currently filters by difficulty, rating & status
    const { page = 1, limit = 10, sort, difficulty, minRating, status} = req.query;
    const filter =  {}; 
    if (difficulty) filter.difficulty = difficulty;
    if (minRating) filter.rating = { $gte: Number(minRating) }; // all trips > minRating
    if(status) filter.status = status;

    const trips = await Trip.find(filter)
    .select("title description distance duration rating reviewCount imageURLs difficulty status")
    .sort(sort || "title") // default sort by title in ascending order
    .skip((page - 1) * limit) // implementing pages by skipping prev data
    .limit(Number(limit)); // converts limit to number just incase
    const total = await Trip.countDocuments(filter);
    res.status(200).json({
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      tripCount: trips.length,
      data: trips,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => { //Gets a detailed view of a specific trip 
  const id = req.params.id;
  try {
    const trip = await Trip.findById(id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    res.status(200).json({trip});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const parseToJSON = (data) => { //Parses string data into Objects when payload is sent with multpart/form-data
  const fields = [
    "startPoint","endPoint","estimatedCost","roadInfo","checkPoints",
    "informativePlaces","journeyKit","tollGates","precautions"
  ];
  for (const field of fields) {
    if (data[field] && typeof data[field] === "string") {
      try {
        data[field] = JSON.parse(data[field]); // parsing
      } catch (e) {
        throw new Error(`Invalid JSON format in field: ${field}`);
      }
    }
  }
};


const totalCost = (vehicle) => { // dynamically calculates total in estimatedCost
  if (!vehicle) return 0;
  const { fuel = 0, tolls = 0, accommodation = 0, food = 0, parking = 0 } = vehicle;
  return fuel + tolls + accommodation + food + parking;
};

router.post("/", upload.array("images"), async (req, res) => { // creates a trip
  try {
    const body = { ...req.body };
    parseToJSON(body); // sending data for parsing
    if (body.estimatedCost?.car) body.estimatedCost.car.total = totalCost(body.estimatedCost.car); // calculates totalCost of car and bike
    if (body.estimatedCost?.bike) body.estimatedCost.bike.total = totalCost(body.estimatedCost.bike);
    body.status = "active";  // makes sure status is active to create a trip
    const trip = new Trip(body);
    if (req.files && req.files.length > 0) { // if files are present organizes them into trips folder in cloudinary
      const uploadedImages = await Promise.all(
        req.files.map((file) => uploadToCloudinary(file.buffer, `trips/${trip._id}`))
      );
      trip.imageURLs = uploadedImages.map((img) => img.secure_url); //stores secure url of each image
    }
    await trip.save(); // saves trip into cloudinary
    res.status(201).json({ message: "Trip created successfully", trip });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", upload.array("images"), async (req, res) => { // updates trip, images & fields
  try {
    const id = req.params.id;
    const body = { ...req.body };
    parseToJSON(body);// parsing data into JSON
    const trip = await Trip.findById(id); //fetches trip
    if (!trip) return res.status(404).json({ error: "Trip not found" }); 
    const allowedFields = [ // Only these fields are allowd for updation, control over fields updation
      "title","description","startPoint","endPoint","distance","duration",
      "estimatedCost","roadInfo","informativePlaces","journeyKit",
      "precautions","checkPoints","tollGates"
    ];
    for (const key of allowedFields) {
      if (body[key] !== undefined) trip[key] = body[key];  // sets new values to body/data
    }
    if (trip.estimatedCost?.car) trip.estimatedCost.car.total = totalCost(trip.estimatedCost.car);  // calculates totalCost of car and bike
    if (trip.estimatedCost?.bike) trip.estimatedCost.bike.total = totalCost(trip.estimatedCost.bike);
    if (req.files && req.files.length > 0) { // if files are present, deletes the prev dir and place new files
      await cloudinary.api.delete_resources_by_prefix(`trips/${trip._id}`);
      const uploadedImages = await Promise.all(
        req.files.map((file) => uploadToCloudinary(file.buffer, `trips/${trip._id}`))
      );
      trip.imageURLs = uploadedImages.map((img) => img.secure_url);
    }
    const updatedTrip = await trip.save(); // holds updated trip
    res.status(200).json({ message: "Trip updated successfully", updatedTrip });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id/status", async (req, res) => { // route for trip status management
  try {
    const id = req.params.id;
    const trip = await Trip.findById(id).select("status"); //Only selects status for performance imps
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (!req.body.status) return res.status(400).json({ error: "Cannot set empty status" }); //validates empty status
    trip.status = req.body.status;
    await trip.save();
    res.status(200).json(trip);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


export default router;
