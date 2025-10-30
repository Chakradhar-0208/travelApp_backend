// import express from "express";
// import Trip from "../models/Trip.js";
// import upload from "../middlewares/multer.js";
// import { v2 as cloudinary } from "cloudinary";
// import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
// const router = express.Router();

// router.get("/", async (req, res) => { // Ge ts some basic info of all trips 
//   try { // currently filters by difficulty, rating & status
//     const { page = 1, limit = 10, sort, difficulty, minRating, status} = req.query;
//     const filter =  {}; 
//     if (difficulty) filter.difficulty = difficulty;
//     if (minRating) filter.rating = { $gte: Number(minRating) }; // all trips > minRating
//     if(status) filter.status = status;

//     const trips = await Trip.find(filter)
//     .select("title description distance duration rating reviewCount imageURLs difficulty status")
//     .sort(sort || "title") // default sort by title in ascending order
//     .skip((page - 1) * limit) // implementing pages by skipping prev data
//     .limit(Number(limit)); // converts limit to number just incase
//     const total = await Trip.countDocuments(filter);
//     res.status(200).json({
//       currentPage: Number(page),
//       totalPages: Math.ceil(total / limit),
//       tripCount: trips.length,
//       data: trips,
//     });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// router.get("/:id", async (req, res) => { //Gets a detailed view of a specific trip 
//   const id = req.params.id;
//   try {
//     const trip = await Trip.findById(id);
//     if (!trip) return res.status(404).json({ error: "Trip not found" });
//     res.status(200).json({trip});
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// const parseToJSON = (data) => { //Parses string data into Objects when payload is sent with multpart/form-data
//   const fields = [
//     "startPoint","endPoint","estimatedCost","roadInfo","checkPoints",
//     "informativePlaces","journeyKit","tollGates","precautions"
//   ];
//   for (const field of fields) {
//     if (data[field] && typeof data[field] === "string") {
//       try {
//         data[field] = JSON.parse(data[field]); // parsing
//       } catch (e) {
//         throw new Error(`Invalid JSON format in field: ${field}`);
//       }
//     }
//   }
// };


// const totalCost = (vehicle) => { // dynamically calculates total in estimatedCost
//   if (!vehicle) return 0;
//   const { fuel = 0, tolls = 0, accommodation = 0, food = 0, parking = 0 } = vehicle;
//   return fuel + tolls + accommodation + food + parking;
// };

// router.post("/", upload.array("images"), async (req, res) => { // creates a trip
//   try {
//     const body = { ...req.body };
//     parseToJSON(body); // sending data for parsing
//     if (body.estimatedCost?.car) body.estimatedCost.car.total = totalCost(body.estimatedCost.car); // calculates totalCost of car and bike
//     if (body.estimatedCost?.bike) body.estimatedCost.bike.total = totalCost(body.estimatedCost.bike);
//     body.status = "active";  // makes sure status is active to create a trip
//     const trip = new Trip(body);
//     if (req.files && req.files.length > 0) { // if files are present organizes them into trips folder in cloudinary
//       const uploadedImages = await Promise.all(
//         req.files.map((file) => uploadToCloudinary(file.buffer, `trips/${trip._id}`))
//       );
//       trip.imageURLs = uploadedImages.map((img) => img.secure_url); //stores secure url of each image
//     }
//     await trip.save(); // saves trip into cloudinary
//     res.status(201).json({ message: "Trip created successfully", trip });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// router.put("/:id", upload.array("images"), async (req, res) => { // updates trip, images & fields
//   try {
//     const id = req.params.id;
//     const body = { ...req.body };
//     parseToJSON(body);// parsing data into JSON
//     const trip = await Trip.findById(id); //fetches trip
//     if (!trip) return res.status(404).json({ error: "Trip not found" }); 
//     const allowedFields = [ // Only these fields are allowd for updation, control over fields updation
//       "title","description","startPoint","endPoint","distance","duration",
//       "estimatedCost","roadInfo","informativePlaces","journeyKit",
//       "precautions","checkPoints","tollGates"
//     ];
//     for (const key of allowedFields) {
//       if (body[key] !== undefined) trip[key] = body[key];  // sets new values to body/data
//     }
//     if (trip.estimatedCost?.car) trip.estimatedCost.car.total = totalCost(trip.estimatedCost.car);  // calculates totalCost of car and bike
//     if (trip.estimatedCost?.bike) trip.estimatedCost.bike.total = totalCost(trip.estimatedCost.bike);
//     if (req.files && req.files.length > 0) { // if files are present, deletes the prev dir and place new files
//       await cloudinary.api.delete_resources_by_prefix(`trips/${trip._id}`);
//       const uploadedImages = await Promise.all(
//         req.files.map((file) => uploadToCloudinary(file.buffer, `trips/${trip._id}`))
//       );
//       trip.imageURLs = uploadedImages.map((img) => img.secure_url);
//     }
//     const updatedTrip = await trip.save(); // holds updated trip
//     res.status(200).json({ message: "Trip updated successfully", updatedTrip });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// router.put("/:id/status", async (req, res) => { // route for trip status management
//   try {
//     const id = req.params.id;
//     const trip = await Trip.findById(id).select("status"); //Only selects status for performance imps
//     if (!trip) return res.status(404).json({ error: "Trip not found" });
//     if (!req.body.status) return res.status(400).json({ error: "Cannot set empty status" }); //validates empty status
//     trip.status = req.body.status;
//     await trip.save();
//     res.status(200).json(trip);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });


// export default router;

import express from "express";
import Trip from "../models/Trip.js";
import upload from "../middlewares/multer.js";
import { v2 as cloudinary } from "cloudinary";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import authenticateToken from "../middlewares/auth.js";
import rateLimit from "express-rate-limit";
import { getCache, setCache, invalidateTripCache } from "../utils/memoryCache.js";


const router = express.Router();

const parseToJSON = (data) => {
  const fields = [
    "startPoint", "endPoint", "estimatedCost", "roadInfo", "checkPoints",
    "informativePlaces", "journeyKit", "tollGates", "precautions"
  ];
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

const totalCost = (vehicle) => {
  if (!vehicle) return 0;
  const { fuel = 0, tolls = 0, accommodation = 0, food = 0, parking = 0 } = vehicle;
  return fuel + tolls + accommodation + food + parking;
};

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: "Too many requests from this IP, please try again later."
});

router.use(limiter);

//////////////////////////////
// 🔹 GET All Trips (Cached)
//////////////////////////////
router.get("/", async (req, res) => {
  try {
    const cacheKey = `trips:${JSON.stringify(req.query)}`;
    const cachedData = getCache(cacheKey);

    if (cachedData) {
      console.log("Cache found: ", cacheKey);
      return res.status(200).json({ ...cachedData, source: "cache" });
    }

    const { page = 1, limit = 10, sort = "title", difficulty, minRating, status } = req.query;
    const validDifficulties = ["easy", "moderate", "hard"];
    const validStatuses = ["active", "inactive", "deleted"];
    
    if (difficulty && !validDifficulties.includes(difficulty)) {
      return res.status(400).json({ error: "Invalid difficulty value" });
    }
    
    const ratingNum = Number(minRating);
    if (minRating && (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5)) {
      return res.status(400).json({ error: "Invalid rating value" });
    }
    
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    const filter = {};
    if (difficulty) filter.difficulty = difficulty;
    if (minRating) filter.rating = { $gte: Number(minRating) };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    let query = Trip.find(filter)
      .select("title description distance duration rating reviewCount imageURLs difficulty status ")
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

  

    const trips = await query;
    const total = await Trip.countDocuments(filter);

    const response = {
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      tripCount: trips.length,
      data: trips,
    };
    setCache(cacheKey, response); // ✅ Cache the response
    console.log("Cache set: ", cacheKey); 
    // console.log("user",req.user.userId);
    res.status(200).json({ ...response, source: "db" });
  } catch (err) {
    console.error("❌ Error fetching trips:", err);
    res.status(400).json({ error: err.message });
  }
});

//////////////////////////////
// 🔹 GET Trip by ID (Cached)
//////////////////////////////
router.get("/:id", async (req, res) => {
  try {
    const cacheKey = `trip:${req.params.id}`;
    const cachedData = getCache(cacheKey);

    if (cachedData) {
      console.log("Cache found: ", cacheKey);
      return res.status(200).json({ trip: cachedData, source: "cache" });
    }

    const { populate } = req.query;
    let query = Trip.findById(req.params.id).populate("createdBy", "name email").lean();
  

    const trip = await query;
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    setCache(cacheKey, trip);
    console.log("Cache set: ", cacheKey);
    res.status(200).json({ trip, source: "db" });
  } catch (err) {
    console.error("Error fetching trip:", err);
    res.status(400).json({ error: err.message });
  }
});

//////////////////////////////
// 🔹 Create Trip
//////////////////////////////
router.post("/", authenticateToken, upload.array("images"), async (req, res) => {
  try {
    const body = { ...req.body };
    parseToJSON(body);

    if (body.estimatedCost?.car) body.estimatedCost.car.total = totalCost(body.estimatedCost.car);
    if (body.estimatedCost?.bike) body.estimatedCost.bike.total = totalCost(body.estimatedCost.bike);

    body.status = "active";
    body.createdBy = req.user.userId;

    const trip = new Trip(body);

    if (req.files?.length > 0) {
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

    await trip.save();
    invalidateTripCache(); // clear cache after creation

    res.status(201).json({ message: "Trip created successfully", trip });
  } catch (err) {
    console.error("Error creating trip:", err);
    res.status(400).json({ error: err.message });
  }
});

//////////////////////////////
// 🔹 Update Trip
//////////////////////////////
router.put("/:id", authenticateToken, upload.array("images"), async (req, res) => {
  try {
    const id = req.params.id;
    const body = { ...req.body };
    parseToJSON(body);

    const trip = await Trip.findById(id);
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const allowedFields = [
      "title", "description", "startPoint", "endPoint", "distance", "duration",
      "estimatedCost", "roadInfo", "informativePlaces", "journeyKit",
      "precautions", "checkPoints", "tollGates", "status"
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) trip[key] = body[key];
    }

    if (trip.estimatedCost?.car) trip.estimatedCost.car.total = totalCost(trip.estimatedCost.car);
    if (trip.estimatedCost?.bike) trip.estimatedCost.bike.total = totalCost(trip.estimatedCost.bike);

    if (req.files?.length > 0) {
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
    console.error("❌ Error updating trip:", err);
    res.status(400).json({ error: err.message });
  }
});

//////////////////////////////
// 🔹 Update Trip Status
//////////////////////////////
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Status is required" });

    const trip = await Trip.findById(id).select("status");
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    trip.status = status;
    await trip.save();

    invalidateTripCache(); // clear cache after status change
    res.status(200).json({ message: "Status updated", status });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(400).json({ error: err.message });
  }
});




export default router;
