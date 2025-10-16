import express from "express";
import Review from "../models/Review.js";
import upload from "../middlewares/multer.js";
import { v2 as cloudinary } from "cloudinary";
import { uploadToCloudinary } from "../utils/cloudinaryUpload.js";
const router = express.Router();

router.get("/", (req, res) => { // Checks if route is active
  res.send("Review Management Route Active");
});

router.get("/:tripId/reviews", async (req, res) => { //returns all review of a specific trip
  const tripId = req.params.tripId;
  try {
    let review = await Review.find({ trip: tripId });
    res.status(200).json({ review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:tripId/:reviewId", async(req,res) => { //returns a specific review of a trip.
  const {tripId, reviewId} = req.params;
  try{
    let review = await Review.findOne({ _id: reviewId, trip: tripId });
    if(!review) return res.status(404).send("Review not found");
    res.status(200).json({ review });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
})

router.post("/:tripId/reviews", upload.array("images"), async (req, res) => { // creates a new review of a trip
  const tripId = req.params.tripId;
  let reviewData = { ...req.body, trip: tripId };
  if (reviewData.checkpoints) {
    try { // parsing checkpoints if sent as string (form-data if using postman)
      reviewData.checkpoints = JSON.parse(reviewData.checkpoints);
    } catch (e) {
      return res.status(400).json({ message: "Invalid checkpoints format" });
    }
  }
  if ( // validating required fields
    !reviewData ||
    !reviewData.user ||
    !reviewData.trip ||
    !reviewData.rating
  ) {
    return res.status(400).json({ message: "Fill all the required fields." });
  }
  const existingReview = await Review.findOne({
    user: reviewData.user,
    trip: reviewData.trip,
  });

  if (existingReview) {
    return res.status(400).send("Only one review per user per trip is allowed");
  }
  let review = new Review(reviewData);
  let uploadedImages = [];
  if (req.files && req.files.length > 0) { // uploads images to cloudinary and pushes the URL into uploadedImages array
    uploadedImages = await Promise.all(
      req.files.map((file) =>
        uploadToCloudinary(file.buffer, `reviews/${review._id}`)
      )
    );
    review.images = uploadedImages.map((img) => img.secure_url);
  }
  try {
    await review.save();
    res.status(201).json({ message: "Review created successfully", review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put( // allows to update specific fileds of a review
  "/:tripId/:reviewId/update",
  upload.array("images"),
  async (req, res) => {
    let { tripId, reviewId } = req.params;
    const body = req.body;
    const allowedFields = ["rating", "comment", "checkpoints"];

    let review = await Review.findById(reviewId);
    if (!review) return res.status(404).send("Review not found");

    if (review.user.toString() !== body.user) {
      return res.status(403).send("Unauthorized action");
    }

    if (review.trip.toString() !== tripId) {
      return res.status(400).send("Review does not belong to this trip");
    }
    if (body.checkpoints) {
      try { // parsing checkpoints if sent as string (form-data if using postman)
        body.checkpoints = JSON.parse(body.checkpoints);
      } catch (e) {
        return res.status(400).send("Invalid checkpoints format");
      }   
    }
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        review[key] = body[key];
      }
    }

    let imageURLS = [];
    await cloudinary.api.delete_resources_by_prefix(`reviews/${review._id}`); // empties the image folder of review in cloudinary
    if (req.files && req.files.length > 0) { // uploads new images to cloud and appends the urls to imageURLS array
      const uploaded = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinary(file.buffer, `reviews/${review._id}`)
        )
      );
      imageURLS.push(...uploaded.map((img) => img.secure_url));
    }
    review.images = imageURLS; // updates images field in review (DB)

    try {
      const updatedReview = await review.save();
      res.status(200).json({ updatedReview });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.put("/:tripId/:reviewId/voting", async (req, res) => { // impemeted voting logic here with validation
  let { tripId, reviewId } = req.params;
  const body = req.body;

  let review = await Review.findById(reviewId);
  if (!review) return res.status(404).send("Review not found");

  if (review.trip.toString() !== tripId) {
    return res.status(400).send("Review does not belong to this trip");
  }

  try {
    if ( // validates if receiving valid data
      body.userVote !== undefined &&
      body.userId &&
      (body.userVote === "up" ||
        body.userVote === "down" ||
        body.userVote === null)
    ) {
      const prevVote = review.votes.find(
        (v) => v.userId.toString() === body.userId // fetches if vote is existing from same user using arrow function
      );

      if (!prevVote) { // if no previous vote, just increments the respective vote count
        if (body.userVote === "up") review.upVotes += 1;
        else if (body.userVote === "down") review.downVotes += 1;
        review.votes.push({ userId: body.userId, vote: body.userVote });        // adds updated/new vote to votes array
      } else if (prevVote.vote === "up" && body.userVote !== "up") { // deals with vote changes if previous vote exists
        if (review.upVotes > 0) review.upVotes -= 1;
        if (body.userVote === "down") review.downVotes += 1;
        prevVote.vote = body.userVote;
      } else if (prevVote.vote === "down" && body.userVote !== "down") { // deals with vote changes if previous vote exists
        if (review.downVotes > 0) review.downVotes -= 1;
        if (body.userVote === "up") {
          review.upVotes += 1;
        }
        prevVote.vote = body.userVote;
      } else if (prevVote.vote === null) { // increments vote if prevVote is null 
        if (body.userVote === "up") review.upVotes += 1;
        else if (body.userVote === "down") review.downVotes += 1;
        prevVote.vote = body.userVote;
      }
    } else {
      return res.status(400).send("Invalid voting data");
    }
    const updatedReview = await review.save();
    res.status(200).json({ updatedReview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:tripId/:reviewId", async (req, res) => { // user route to delte a review of their own along with their images
  let { tripId, reviewId } = req.params;
  const body = req.body;
  try {
    const result = await Review.findById(reviewId);
    if (!result) return res.status(404).send("Review not found");
    if (result.user.toString() !== body.user) {
      return res.status(403).send("Unauthorized action");
    }

    if (result.trip.toString() !== tripId) {
      return res.status(400).send("Review does not belong to this trip");
    }
    await cloudinary.api.delete_resources_by_prefix(`reviews/${reviewId}`);
    await Review.findByIdAndDelete(reviewId);
    res.status(200).json({ message: "Review deleted successfully", result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/admin/:tripId/:reviewId", async (req, res) => { // admin route to delete any review along with cloudinary images
  const { tripId, reviewId } = req.params;
  const body = req.body;
  try {
    if (body.role !== "admin")
      return res.status(403).send("Unauthorized action");
    
    await cloudinary.api.delete_resources_by_prefix(`reviews/${reviewId}`);
    const result = await Review.findByIdAndDelete(reviewId);
    if (!result) return res.status(404).send("Review not found");
    if (result.trip.toString() !== tripId) {
      return res.status(400).send("Review does not belong to this trip");
    }

    res.status(200).json({ message: "Review deleted successfully", result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
