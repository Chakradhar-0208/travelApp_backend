import express from "express";
import Review from "../models/Review.js";
import upload from "../middlewares/multer.js";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
import { getCache, setCache, invalidateReviewCache } from "../utils/caching/reviewCache.js";
import authenticateToken from "../middlewares/auth.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.send("Review Management Route Active");
});


router.get("/:tripId", async (req, res) => { //Fetch All Reviews for a Trip 
  try {
    const { tripId } = req.params;

    const cacheKey = `reviews:trip-${tripId}`;
    const cached = getCache(cacheKey);
    if (cached) {
      console.log("Cache found:", cacheKey);
      return res.status(200).json({ ...cached, source: "cache" });
    }

    let query = Review.find({ trip: tripId })
      .populate("user", "name email profileImage")
      .select("rating comment upVotes downVotes createdAt")
      .sort({ createdAt: -1 })
      .lean();


    const reviews = await query;
    const total = await Review.countDocuments({ trip: tripId });
    const response = { reviews, total};

    setCache(cacheKey, response);
    console.log("Cache set:", cacheKey);
    res.status(200).json({ ...response, source: "db" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.get("/:tripId/:reviewId", async (req, res) => {  //detailed review fetch
  try {
    const { tripId, reviewId } = req.params;
    const cacheKey = `review:${reviewId}`;

    const cached = getCache(cacheKey);
    console.log("Cache found: ",cacheKey)
    if (cached) return res.status(200).json({ ...cached, source: "cache" });

    const review = await Review.findOne({ _id: reviewId, trip: tripId })
      .populate("user", "name profileImage email")
      .lean();

    if (!review) return res.status(404).json({ message: "Review not found" });

    setCache(cacheKey, { review });
    console.log("Cache set:", cacheKey);
    res.status(200).json({ review, source: "db" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post("/:tripId", authenticateToken, upload.array("images"), async (req, res) => { // create Review
  const { tripId } = req.params;
  const allowedFields = ["rating", "comment", "checkpoints"];
  let reviewData = {};
  for (const key of allowedFields) {
    if(req.body[key]!==undefined)
     reviewData[key] = req.body[key]
    }
  reviewData = { ...reviewData, trip: tripId };
  reviewData.user = req.user.userId;
  try {
    if (reviewData.checkpoints) reviewData.checkpoints = JSON.parse(reviewData.checkpoints);

    if (!reviewData.user || !reviewData.trip || !reviewData.rating)
      return res.status(400).json({ message: "Required fields missing" });

    const existing = await Review.findOne({ user: reviewData.user, trip: tripId }).lean();
    if (existing) return res.status(400).json({ message: "One review per trip per user" });

    const review = new Review(reviewData);
    await review.save();

    
    if (req.files && req.files.length > 0) {
      setImmediate(async () => {
        try {
          const uploads = await Promise.all(
            req.files.map((file) => uploadToCloudinary(file.buffer, `reviews/${review._id}`))
          );
          review.images = uploads.map((u) => u.secure_url);
          await review.save();
          console.log("Review images uploaded:", review._id);
        } catch (e) {
          console.error("Background upload failed:", e.message);
        }
      });
    }

    invalidateReviewCache(); // clear cache after changes.
    res.status(201).json({ message: "Review created successfully", review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put("/:tripId/:reviewId/update", authenticateToken, upload.array("images"), async (req, res) => { // Update Review
  try {
    const { tripId, reviewId } = req.params;
    const body = req.body;

    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (review.user.toString() !== req.user.userId && req.user.role !== "admin")
      return res.status(403).json({ message: "Unauthorized" });

    if (review.trip.toString() !== tripId)
      return res.status(400).json({ message: "Review doesn't belong to this trip" });

    if (body.checkpoints) body.checkpoints = JSON.parse(body.checkpoints);

    const allowed = ["rating", "comment", "checkpoints"];
    for (const key of allowed) if (body[key]) review[key] = body[key];


    if (req.files && req.files.length > 0) { //Background image update
      setImmediate(async () => {
        try {
          await cloudinary.api.delete_resources_by_prefix(`reviews/${review._id}`);
          const uploads = await Promise.all(
            req.files.map((file) => uploadToCloudinary(file.buffer, `reviews/${review._id}`))
          );
          review.images = uploads.map((u) => u.secure_url);
          await review.save();
          console.log("Review images replaced:", review._id);
        } catch (e) {
          console.error("Image update failed:", e.message);
        }
      });
    }

    await review.save();
    invalidateReviewCache();
    res.status(200).json({ message: "Review updated successfully", review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put("/:tripId/:reviewId/voting", authenticateToken, async (req, res) => {
  try {
    const { tripId, reviewId } = req.params;
    const { userVote } = req.body; // e.g., "up", "down", or null
    const userId = req.user.userId; // from verified JWT

    // Fetch the review
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    // Ensure review belongs to the correct trip
    if (review.trip.toString() !== tripId)
      return res.status(400).json({ message: "Review does not belong to this trip" });

    // Validate the vote type
    if (!["up", "down", null].includes(userVote))
      return res.status(400).json({ message: "Invalid vote type" });

    // Find existing vote by this user
    const prevVote = review.votes.find(
      (v) => v.userId.toString() === userId
    );

    // If the user has never voted before
    if (!prevVote) {
      if (userVote === "up") review.upVotes += 1;
      else if (userVote === "down") review.downVotes += 1;

      review.votes.push({ userId, vote: userVote }); // ✅ fixed: use `userId` from token
    } 
    // If user previously voted "up"
    else if (prevVote.vote === "up" && userVote !== "up") {
      if (review.upVotes > 0) review.upVotes -= 1;
      if (userVote === "down") review.downVotes += 1;
      prevVote.vote = userVote;
    } 
    // If user previously voted "down"
    else if (prevVote.vote === "down" && userVote !== "down") {
      if (review.downVotes > 0) review.downVotes -= 1;
      if (userVote === "up") review.upVotes += 1;
      prevVote.vote = userVote;
    } 
    // If user previously had null or wants to remove vote
    else if (prevVote.vote === null && userVote !== null) {
      if (userVote === "up") review.upVotes += 1;
      else if (userVote === "down") review.downVotes += 1;
      prevVote.vote = userVote;
    } 
    else if (userVote === null) {
      // If user wants to remove their vote completely
      if (prevVote.vote === "up" && review.upVotes > 0) review.upVotes -= 1;
      if (prevVote.vote === "down" && review.downVotes > 0) review.downVotes -= 1;
      prevVote.vote = null;
    }

    // Save changes
    await review.save();

    // Invalidate cache
    invalidateReviewCache();

    res.status(200).json({
      message: "Vote updated successfully",
      review,
    });

  } catch (err) {
    console.error("Voting error:", err);
    res.status(500).json({ error: err.message });
  }
});


router.delete("/:tripId/:reviewId", authenticateToken, async (req, res) => { //deletes a review
  try {
    const { tripId, reviewId } = req.params;
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (review.user.toString() !== req.user.userId && req.user.role !== "admin")
      return res.status(403).json({ message: "Unauthorized" });

    await cloudinary.api.delete_resources_by_prefix(`reviews/${reviewId}`);
    await Review.findByIdAndDelete(reviewId);

    invalidateReviewCache();
    res.status(200).json({ message: "Review deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
