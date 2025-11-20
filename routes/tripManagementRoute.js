import express from "express";
import Trip from "../models/Trip.js";
import upload from "../middlewares/multer.js";
import User from "../models/User.js";
import { v2 as cloudinary } from "cloudinary";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import authenticateToken from "../middlewares/auth.js";
import rateLimit from "express-rate-limit";
import { getCache, setCache, invalidateTripCache } from "../utils/caching/tripCache.js";
import { sanitizeNumbers } from "../utils/sanitizeNumbers.js";
import { isValidObjectId } from "mongoose";

const router = express.Router();

const parseToJSON = (data) => {//parses json fields from string to object
  const fields = ["startPoint", "endPoint", "estimatedCost", "roadInfo", "checkPoints",
    "informativePlaces", "journeyKit", "tollGates", "precautions"];

  for (const field of fields) {
    if (data[field] && typeof data[field] === "string") {
      try {
        data[field] = JSON.parse(data[field]);
      } catch {
        throw new Error(`Invalid JSON format in field: ${field}`);
      }
    }
  }
};

const totalCost = (vehicle) => {// calculates total cost dynamically
  if (!vehicle) return 0;
  const { fuel = 0, tolls = 0, accommodation = 0, food = 0, parking = 0, } = vehicle;
  return fuel + tolls + accommodation + food + parking;  // total takes the return value
};

// const limiter = rateLimit({// rate limiter to ensure only 100 reqs per min
//   windowMs: 60 * 1000,
//   max: 100,
//   message: "Too many requests from this IP, please try again later.",
// });

// router.use(limiter);



router.get("/", async (req, res) => {// gets all trips
  try {
    const cacheKey = `trips:${JSON.stringify(req.query)}`;
    const cachedData = getCache(cacheKey); // tries to get data from cache

    if (cachedData) {
      console.log("Cache found: ", cacheKey);
      return res.status(200).json({ ...cachedData, source: "cache" });
    }

    const { page = 1, limit = 10, sort = "title", difficulty, minRating, status, } = req.query;
    const validDifficulties = ["easy", "moderate", "hard"];
    const validStatuses = ["active", "inactive", "deleted"];

    if (difficulty && !validDifficulties.includes(difficulty)) {// params validation
      return res.status(400).json({ error: "Invalid difficulty value" });
    }

    const ratingNum = Number(minRating);
    if (minRating && (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5)) {
      return res.status(400).json({ error: "Invalid rating value" });
    }

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const filter = {}; // filtering based on params
    if (difficulty) filter.difficulty = difficulty;
    if (minRating) filter.rating = { $gte: Number(minRating) };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    let query = Trip.find(filter)
      .select("title description distance duration rating reviewCount imageURLs difficulty status startPoint endPoint estimatedCost")
      .select("title description distance duration rating reviewCount imageURLs difficulty status startPoint endPoint estimatedCost")
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean(); // gives read only js

    const trips = await query;
    const total = await Trip.countDocuments(filter);

    const response = {
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      tripCount: trips.length,
      data: trips,
    };
    setCache(cacheKey, response); // sets cache
    console.log("Cache set: ", cacheKey);
    // console.log("user",req.user.userId);
    res.status(200).json({ ...response, source: "db" });
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {// gets detailed view of a trip
  try {
    const cacheKey = `trip:${req.params.id}`; // gives a name to cache
    const cachedData = getCache(cacheKey);

    if (cachedData) {
      console.log("Cache found: ", cacheKey);
      return res.status(200).json({ trip: cachedData, source: "cache" });
    }

    const trip = await Trip.findById(req.params.id)
      .populate("createdBy", "name email")
      .lean();

    if (!trip) return res.status(404).json({ error: "Trip not found" });

    setCache(cacheKey, trip);
    console.log("Cache set: ", cacheKey);
    res.status(200).json({ trip, source: "db" });
  } catch (err) {
    console.error("Error fetching trip:", err);
    res.status(400).json({ error: err.message });
  }
});


router.post("/:id/save", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tripId = req.params.id;

    const trip = await Trip.findById(tripId).select("_id");
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const user = await User.findById(userId).select("savedTrips");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.savedTrips?.includes(tripId)) {
      return res.status(400).json({ error: "Trip already saved" });
    }

    await User.updateOne(
      { _id: userId },
      { $push: { savedTrips: tripId } }
    );

    res.status(200).json({ message: "Trip saved successfully" });
  } catch (err) {
    console.error("Error saving trip:", err);
    res.status(400).json({ error: err.message });
  }
});

router.post("/", authenticateToken, upload.array("images"), async (req, res) => {
  try {
    const body = { ...req.body };
    parseToJSON(body); // returns parsed data

    const cleanData = sanitizeNumbers(body);

    if (cleanData.estimatedCost?.car) cleanData.estimatedCost.car.total = totalCost(cleanData.estimatedCost.car);
    if (cleanData.estimatedCost?.bike) cleanData.estimatedCost.bike.total = totalCost(cleanData.estimatedCost.bike);

    if (cleanData.estimatedCost?.car) cleanData.estimatedCost.car.total = totalCost(cleanData.estimatedCost.car);
    if (cleanData.estimatedCost?.bike) cleanData.estimatedCost.bike.total = totalCost(cleanData.estimatedCost.bike);

    cleanData.status = "inactive";  // ensures status is inactive on creation, admin has to approve
    cleanData.createdBy = req.user.userId; // sets createdBy from auth middleware
    cleanData.status = "inactive";  // ensures status is inactive on creation, admin has to approve
    cleanData.createdBy = req.user.userId; // sets createdBy from auth middleware

    const trip = new Trip(cleanData);

    if (req.files?.length > 0) { // uploads images to cloudinary if present
      const uploadedImages = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, `trips/${trip._id}`, {
            transformation: [ // optimizes images
              { width: 1200, height: 800, crop: "limit" },
              { fetch_format: "auto", quality: "auto" },
            ],
          })
        )
      );
      trip.imageURLs = uploadedImages.map((img) => img.secure_url);
    }

    await trip.save();
    invalidateTripCache(); // clear cache after creation

    res.status(201).json({ message: "Trip created successfully", trip });
  } catch (err) {
    console.error("Error creating trip:", err);
    res.status(400).json({ error: err.message });
  }
}
);

router.put("/:id", authenticateToken, upload.array("images"), async (req, res) => {
  try {
    const id = req.params.id;

    const trip = await Trip.findById(id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    if (trip.createdBy.toString() !== req.user.userId) {
      return res.status(403).json({ error: "You are not authorized to update this trip" });
    }

    const body = { ...req.body }; // takes data from body
    parseToJSON(body);

    const cleanData = sanitizeNumbers(body);

    const allowedFields = ["title", "description", "startPoint", "endPoint", "distance", "duration", "estimatedCost",
      "roadInfo", "informativePlaces", "journeyKit", "precautions", "checkPoints", "tollGates",
    ]; // only these fields can be updated

    for (const key of allowedFields) {
      if (cleanData[key] !== undefined) trip[key] = cleanData[key];
      if (cleanData[key] !== undefined) trip[key] = cleanData[key];
    }

    if (trip.estimatedCost?.car) trip.estimatedCost.car.total = totalCost(trip.estimatedCost.car);
    if (trip.estimatedCost?.bike) trip.estimatedCost.bike.total = totalCost(trip.estimatedCost.bike);

    if (req.files?.length > 0) { // if images are present, deletes prev and uploads new ones
      await cloudinary.api.delete_resources_by_prefix(`trips/${trip._id}`);
      const uploadedImages = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, `trips/${trip._id}`, {
            transformation: [
              { width: 1200, height: 800, crop: "limit" },
              { fetch_format: "auto", quality: "auto" },
            ],
          })
        )
      );
      trip.imageURLs = uploadedImages.map((img) => img.secure_url);
    }

    const updatedTrip = await trip.save();
    invalidateTripCache(); // clear cache after update

    res.status(200).json({ message: "Trip updated successfully", updatedTrip });
  } catch (err) {
    console.error("Error updating trip:", err);
    res.status(400).json({ error: err.message });
  }
}
);

router.delete("/:id", authenticateToken, async (req, res) => { // deletes a trip
  try {
    const id = req.params.id;

    const trip = await Trip.findById(id).select("status createdBy imageURLs"); //! MODIFIED
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    if (trip.createdBy.toString() !== req.user.userId) {  // only creator can delete
      return res.status(403).json({ error: "You are not authorized to delete this trip" });
    }

    if (trip.imageURLs && trip.imageURLs.length > 0)
      await cloudinary.api.delete_resources_by_prefix(`trips/${trip._id}`);
    await trip.deleteOne({ _id: id });

    invalidateTripCache(); // clear cache after deletion
    res.status(200).json({ message: "Trip deleted successfully" });
  } catch (err) {
    console.error("Error deleting trip:", err);
    res.status(400).json({ error: err});
  }
});

router.delete("/saved-trips/:tripId", authenticateToken, async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    if (!tripId) {
      return res.status(400).json({ message: "TripId is required" });
    }

    if (!isValidObjectId(tripId)) {
      return res.status(400).json({ message: "Invalid Trip Id" });
    }

    const user = await User.findById(userId);

    if (!user.savedTrips.includes(tripId)) {
      return res.status(400).json({ message: "This trip is not in saved list" });
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { savedTrips: tripId }
    });

    res.status(200).json({
      message: "success"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
