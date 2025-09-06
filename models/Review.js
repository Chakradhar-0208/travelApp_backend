import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {     // user._id, user.name, user.profileImage, user.email ...
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    checkpointId: { type: String, required: true },
    checkpointName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5, index: false },
    images: [{ type: String }],
    upVotes: { type: Number, default: 0, min: 0 },
    downVotes: { type: Number, default: 0, min: 0 },
    userVote: {
      type: String,
      enum: ["up", "down", "null"],
      default: "null",
    },
    comment: { type: String },
  },
  { timestamps: true }
);
reviewSchema.index({ createdAt: -1 });
export default mongoose.model("Review", reviewSchema);
