import express from "express";
import Report from "../models/Report.js";
import authenticateToken from "../middlewares/auth.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import Review from "../models/Review.js";

const router = express.Router();

router.post("/user", authenticateToken, async (req, res) => {
  try {
    const { target, reason, description } = req.body;

    if (req.user.userId === target) {
      return res.status(400).json({ error: "You cannot report yourself." });
    }

    const exists = await User.findById(target).select("_id");
    if (!exists) return res.status(404).json({ error: "Target user not found." });

    const duplicate = await Report.findOne({
      type: "User",
      target,
      reportedBy: req.user.userId,
    });

    if (duplicate) return res.status(400).json({ error: "Already reported." });

    const report = new Report({
      type: "User",
      target,
      reason,
      description,
      reportedBy: req.user.userId,
    });

    await report.save();
    res.status(201).json({ message: "User report created." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/trip", authenticateToken, async (req, res) => {
  try {
    const { target, reason, description } = req.body;

    const exists = await Trip.findById(target).select("_id");
    if (!exists) return res.status(404).json({ error: "Target trip not found." });

    const duplicate = await Report.findOne({
      type: "Trip",
      target,
      reportedBy: req.user.userId,
    });

    if (duplicate) return res.status(400).json({ error: "Already reported." });

    const report = new Report({
      type: "Trip",
      target,
      reason,
      description,
      reportedBy: req.user.userId,
    });

    await report.save();
    res.status(201).json({ message: "Trip report created." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/review", authenticateToken, async (req, res) => {
  try {
    const { target, reason, description } = req.body;

    const exists = await Review.findById(target).select("_id");
    if (!exists) return res.status(404).json({ error: "Target review not found." });

    const duplicate = await Report.findOne({
      type: "Review",
      target,
      reportedBy: req.user.userId,
    });

    if (duplicate) return res.status(400).json({ error: "Already reported." });

    const report = new Report({
      type: "Review",
      target,
      reason,
      description,
      reportedBy: req.user.userId,
    });

    await report.save();
    res.status(201).json({ message: "Review report created." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
