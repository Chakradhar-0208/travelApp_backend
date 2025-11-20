import e from "express";
import multer from "multer";
import authenticateToken from "../middlewares/auth.js";
import Feedback from "../models/Feedback.js";
import { uploadToCloudinaryFeedback } from "../utils/cloudinaryUpload.js";

const router = e.Router();

// Multer setup to parse form-data
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/", authenticateToken, upload.array("screenshots"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, category, description, deviceInfo } = req.body;

    const parsedDeviceInfo = JSON.parse(deviceInfo || "{}");
    const validTypes = ["bug", "ui", "feature"];

    if (!validTypes.includes(type))
      return res.status(400).json({ message: "Invalid type" });

    if (!category || !description || !parsedDeviceInfo.platform || !parsedDeviceInfo.version || !parsedDeviceInfo.model)
      return res.status(400).json({ message: "All fields are required" });

    const feedback = new Feedback({
      userId,
      type,
      category,
      description,
      deviceInfo: parsedDeviceInfo,
    });

    if (req.files && req.files.length > 0) {
      const uploadedImages = await Promise.all(
        req.files.map((file) =>
          uploadToCloudinaryFeedback(file.buffer, `feedbacks/${feedback._id}`)
        )
      );
      feedback.screenshots = uploadedImages.map((img) => img.secure_url);
    }

    await feedback.save();

    res.status(200).json({feedback: feedback});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err });
  }
});

export default router;
