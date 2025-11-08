import express from "express";
import User from "../models/User.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import { getCache, setCache, invalidateUserCache } from "../utils/caching/userCache.js";
import authenticateToken from "../middlewares/auth.js";
import streamifier from "streamifier";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("User Management Route Active");
});


router.get("/getUser", authenticateToken, async (req, res) => {
  try {
    const { email, detailed } = req.query;
    if (!email) return res.status(400).json({ message: "Email required." });

    if (req.user.email !== email && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Unauthorized user." });
    }

    const cacheKey = `user:${JSON.stringify(email)},detailed:${detailed ? detailed : "false"}`;
    const cachedData = getCache(cacheKey);

    if (cachedData) {
      console.log("Cache found:", cacheKey);
      return res.status(200).json({ ...cachedData, source: "cache" });
    }

    let query = User.findOne({ email }).lean();
    if (detailed === "true") {
      query = query.populate(
        "longestTrip.byDistance longestTrip.byDuration",
        "title distance duration"
      );
    } else {
      query = query.select(
        "name email age gender role tripCount totalDistance totalJourneyTime"
      );
    }

    const user = await query;
    if (!user) return res.status(404).json({ message: "User not found." });

    const response = { user };
    setCache(cacheKey, response);
    console.log("Cache set:", cacheKey);

    res.status(200).json({ ...response, source: "db" });
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(400).json({ error: err.message });
  }
});


router.get("/savedTrips", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .populate("savedTrips", "title imageURLs")
      .select("savedTrips")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      savedTrips: user.savedTrips || []
    });
  } catch (err) {
    console.error("Error fetching saved trips:", err);
    res.status(400).json({ error: err.message });
  }
});



router.put("/updateUser/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Authenticated user:", req.user);
    if (req.user.userId !== id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. You can only update your own account." });
    }

    const allowedFields = [
      "name",
      "phone",
      "email",
      "age",
      "gender",
      "interests",
      "travelType",
      "preferences",
      "tripCount",
    ];
    const updates = {};

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: "No valid fields provided." });

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select("name email phone age gender role")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found." });

    invalidateUserCache(); // clear old cache
    console.log("User cache invalidated due to updates.");

    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(400).json({ error: err.message });
  }
});


router.get("/getProfileImage", async (req, res) => {
  try {
    const cacheKey = `profileImage:${JSON.stringify(req.query)}`;
    const cachedData = getCache(cacheKey);

    if (cachedData) {
      console.log("Cache found:", cacheKey);
      return res.status(200).json({ ...cachedData, source: "cache" });
    }

    const { email } = req.query;
    const user = await User.findOne({ email }, { profileImage: 1, _id: 0 }).lean();
    if (!user || !user.profileImage)
      return res.status(404).json({ message: "Profile Image not found" });

    const imageURL = cloudinary.url(user.profileImage, {
      width: 150,
      height: 150,
      crop: "fill",
      quality: "auto",
      fetch_format: "auto",
    });

    const response = { profileImage: imageURL };
    setCache(cacheKey, response);
    console.log("Cache set:", cacheKey);

    res.status(200).json({ ...response, source: "db" });
  } catch (err) {
    console.error("Error fetching profile image:", err);
    res.status(400).json({ error: err.message });
  }
});


router.put("/updateProfileImage", authenticateToken, upload.single("profileImage"), async (req, res) => {
  const { email } = req.body;

  try {
    if (req.user.email !== email && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Unauthorized user." });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found!" });

    setImmediate(() => {
      const name = user.name.split(" ");
      const lastName = name[name.length - 1];
      const publicId = `${lastName}-${user._id}`;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          overwrite: true,
          folder: "profileImage",
        },
        async (error, result) => {
          if (error) return console.error("Upload failed:", error.message);

          user.profileImage = result.public_id;
          await user.save();

          invalidateUserCache();
          console.log(`Profile image updated for ${email}`);
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    res.status(202).json({
      message: "Profile image update queued successfully (background job)",
    });
  } catch (err) {
    console.error("Error updating profile image:", err);
    res.status(500).json({ error: err.message });
  }
});


router.post("/createUser", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Fill all required fields." });

    const user = new User(req.body);
    user.role = "user";
    await user.save();

    invalidateUserCache();
    res.status(201).json({
      message: "User created successfully",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(400).json({ error: err.message });
  }
});


router.delete("/deleteUser", authenticateToken, async (req, res) => {
  const { email } = req.body;

  try {

    if (req.user.email !== email && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Unauthorized user." });
    }

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    await User.deleteOne({ email });
    invalidateUserCache();
    console.log("User cache invalidated due to deletion.");

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(400).json({ error: err.message });
  }
});


router.get("/profile", (req, res) => {
  res.json({ status: "User route working" });
});

export default router;
