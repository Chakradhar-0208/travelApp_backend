import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", required: true,
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", required: true,
    },
    reason: { type: String, required: true },
    description: { type: String },
  status: {
    type: String,
    enum: ["pending", "resolved", "dismissed"],
    default: "pending",
  },
}, { timestamps: true }
);
export default mongoose.model("Report", reportSchema);
