import mongoose from "mongoose";
import InformativePlaceSchema from "./shared/informativePlaceSchema.js";

const GeoJSONPoint = {
  type: {
    type: String,
    enum: ["Point"],
    default:"Point",
    required: true,
  },
  coordinates: {
    type: [Number],
    required: true,
     validate: {
    validator: function (arr) {
      return Array.isArray(arr) && arr.length === 2;
    },
    message: "Coordinates must be [longitude, latitude]",
  },
  },
};

const tripSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },

    startPoint: {
      name: { type: String, required: true },
      location: { ...GeoJSONPoint },
    },

    endPoint: {
      name: { type: String, required: true },
      location: { ...GeoJSONPoint },
    },

    distance: { type: Number, min: 0, required: true, index: true }, // kms
    duration: { type: Number, min: 0, required: true }, // hrs

    estimatedCost: {
      car: {
        fuel: { type: Number, min: 0, required: true },
        tolls: { type: Number, min: 0, required: true },
        accommodation: { type: Number, min: 0 },
        food: { type: Number, min: 0 },
        parking: { type: Number, min: 0 },
        total: { type: Number, min: 0 },
      },
      bike: {
        fuel: { type: Number, min: 0, required: true },
        tolls: { type: Number, min: 0, required: true },
        accommodation: { type: Number, min: 0 },
        food: { type: Number, min: 0 },
        parking: { type: Number, min: 0 },
        total: { type: Number, min: 0 },
      },
    },

    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, default: 0, min: 0 },

    difficulty: {
      type: String,
      enum: ["easy", "moderate", "hard"],
      default:"easy",
    },

    imageURLs: [{ type: String }],

    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
      index: true,
    },

    roadInfo: {
      highways: [{ type: String }],
      ghats: [{ type: String, default: "None" }],
      roadCondition: { type: String },
      traffic: {
        type: String,
        enum: ["low", "moderate", "high", "very high"],
        default: "moderate",
      },
    },

    checkPoints: [
      {
        name: { type: String, required: true },
        location: { ...GeoJSONPoint },
        description: { type: String },
        type: { type: String },
        estimatedStopTime: { type: Number, min: 0 }, // mins
      },
    ],

    informativePlaces: {
      restaurants: [InformativePlaceSchema],
      accommodations: [InformativePlaceSchema],
      hospitals: [InformativePlaceSchema],
      policeStations: [InformativePlaceSchema],
      fuelStations: [InformativePlaceSchema],
      vehicleService: [InformativePlaceSchema],
    },

    journeyKit: [
      {
        item: { type: String, required: true },
        necessity: {
          type: String,
          enum: ["essential", "recommended", "optional"],
          required: true,
        },
      },
    ],

    tollGates: [
      {
        name: { type: String, required: true },
        location: { ...GeoJSONPoint },
        cost: { type: Number, min: 0 },
      },
    ],

    precautions: [{ type: String }],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);


tripSchema.index({ "startPoint.location": "2dsphere" });
tripSchema.index({ "endPoint.location": "2dsphere" });
tripSchema.index({ "checkPoints.location": "2dsphere" });
tripSchema.index({ "tollGates.location": "2dsphere" });

tripSchema.index({ createdBy: 1, status: 1 });
tripSchema.index({ createdAt: -1 });

export default mongoose.model("Trip", tripSchema);
