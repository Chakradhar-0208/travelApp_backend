import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: [
                "bug", "ui", "feature"
            ],
            required: true
        },
        category: {
            type: String,
            required: true
        },
        screenshots: {
            type: [String],

        },
        deviceInfo: {
            platform: { type: String, required: true },
            version: { type: String, required: true },
            model: { type: String, required: true }
        }

    },
    {
        timestamps: true
    }
)

export default mongoose.model("Feedback", feedbackSchema);