import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: { type: Number }, // Improvised
    gender: {
      // Improvised
      type: String,
      enum: ["male", "female", "prefer not to say", null],
      default: null,
    },
    profileImage: { type: String, default: "" },
    interests: [{ type: String }],
    tripCount: { type: Number, default: 0 },
    totalDistance: { type: Number, default: 0 }, //kms
    totalJourneyTime: { type: Number, default: 0 }, //hrs
    travelType: {
      // Improvised
      type: String,
      enum: [
        "adventure",
        "leisure",
        "business",
        "family",
        "solo",
        "group",
      ],
    },
    // reportedUserId: { type: String },
    // reportReason: { type: String },
    // reportDescription: { type: String },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    savedTrips: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Trip",
        default: [],
      }
    ],
    preferences: {
      tripDifficulty: { type: String, enum: ["easy", "moderate", "hard"],default:"moderate" },
      // Improvised
      budgetRange: { type: String },
      altitudeSickness: { type: Boolean, default: false },
      tripSuggestions : {type: Boolean, default: false}, // all three are related to notifications
      checkpointAlerts : {type: Boolean, default: false},
      systemUpdates : {type: Boolean, default: false},
    },
    fcmToken: {type: String, default: null},
    status: {
      type: String,
      enum: ["active", "banned", "inactive"],
      default: "active",
      index: true,
    },
    longestTrip: {
      // Improvised
      byDistance: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
      byDuration: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    },
    googleId: { type: String },
    resetToken: { type: String },
  },
  { timestamps: true }
);

userSchema.index({ tripCount: -1 });

export default mongoose.model("User", userSchema);
