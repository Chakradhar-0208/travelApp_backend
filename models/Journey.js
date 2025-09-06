import mongoose from "mongoose";

const journeySchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startLocation: {
      coordinates: [{ type: Number }],
      address: { type: String },
    },
    endLocation: {
      coordinates: [{ type: Number }],
      address: { type: String },
    },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
      index: true,
    },
    journeyType: {
      type: String,
      enum: ["solo", "group", "family"],
      default: "solo",
      index: true,
    },
    startedOn: { type: Date },
    completedOn: { type: Date, index: false }, // journey completion
    totalDistance: { type: Number, min: 0, index: true }, // in kms
    totalDuration: { type: Number, min: 0 }, // in hours
    checkpoints: [
      { completedAt: { type: Date } }, //checkpoint completion
    ],
    notes: { type: String },
  },
  { timestamps: true }
);
journeySchema.index({ userId: 1, status: 1 });

export default mongoose.model("Journey", journeySchema);
