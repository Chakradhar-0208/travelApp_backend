import mongoose from "mongoose";

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
  },
};

const informativePlacesSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: { ...GeoJSONPoint },
  rating: { type: Number, min: 0, max: 5 },
  priceRange: { type: String },
  contact: { type: String },
});

export default informativePlacesSchema;


// Used this to reduce redundancy in Trip model