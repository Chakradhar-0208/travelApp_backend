import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  target: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "type"
  },

  type: {
    type: String,
    enum: ["User", "Trip", "Review"],
    required: true
  },

  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  reason: { type: String, required: true },
  description: { type: String },

  status: {
    type: String,
    enum: ["pending", "resolved", "dismissed"],
    default: "pending"
  }
}, { timestamps: true });


export default mongoose.model("Report", reportSchema);
