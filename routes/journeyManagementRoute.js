import express from "express";
import Journey from "../models/Journey.js";

const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ message: "Journey Management Route Active" });
});

router.post("/start", async (req, res) => {
  const body = req.body;
  try {
    if (!body.tripId || !body.userId || !body.startLocation) {
      return res.status(400).json({ error: "Please provide all tripId, userId, startLocation" });
    }
    body.startedOn = new Date();
    const journey = new Journey(body);
    await journey.save();
    return res.status(201).json(journey);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put("/:id/checkpoint", async (req, res) => {
  const { id } = req.params;
  const cp = req.body.checkpoint;

  try {
    if (!cp.name || !cp.distance || !cp.duration || !cp.coordinates) {
      return res.status(400).json({error:"Please provide name, distance, duration & coordinates in body"});
    }
    if (typeof cp.distance !== "number" || typeof cp.duration !== "number")
      return res.status(400).json({ error: "Please provide valid distance and duration" });
    if (
      !Array.isArray(cp.coordinates) ||
      cp.coordinates.length !== 2 ||
      typeof cp.coordinates[0] !== "number" ||
      typeof cp.coordinates[1] !== "number"
    ) {
      return res.status(400).json({ error: "Please provide 2 coordinates (N, E) only" });
    }
    const journey = await Journey.findById(id);
    if (!journey) {
      return res.status(404).json({ error: "Journey not found" });
    }
    if (journey.status !== "active") {
      return res.status(400).json({ error: "Journey is not active" });
    }

    const cps = journey.checkpoints;
    if (
      cps.find(
        (c) => c.name.trim().toLowerCase() === cp.name.trim().toLowerCase()
      )
    ) {
      return res.status(400).json({ error: "checkpoint with same name already exists in Journey" });
    }

    cp.completedAt = new Date();
    journey.totalDistance += cp.distance;
    journey.totalDuration += cp.duration;
    journey.checkpoints.push(cp);
    await journey.save();
    res.status(200).json(journey);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id/end", async (req, res) => {
  const { id } = req.params;
  try {
    const journey = await Journey.findById(id);
    if (!journey) {
      return res.status(404).json({ error: "Journey not found" });
    }
    if (journey.status !== "active") {
      return res.status(400).json({ error: `Cannot end a journey with status ${journey.status}` });
    }
    // const now = new Date();
    // journey.completedOn = new Date(
    //   now.getTime() - now.getTimezoneOffset() * 60000
    // )
    //   .toISOString();
    if (!req.body.endLocation) {
      return res.status(400).json({ error: "Please provide endLocation" });
    }
    journey.completedOn = new Date();
    journey.status = "completed";
    journey.endLocation = req.body.endLocation;
    await journey.save();
    res.status(200).json(journey);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get("/active", async (req, res) => {
  try {
    const activeJourneys = await Journey.find({ status: "active" });
    res.status(200).json(activeJourneys);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/history", async (req, res) => {
  try {
    const history = await Journey.find({
      status: { $in: ["completed", "cancelled"] },
    });
    res.status(200).json(history);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id/delete", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await Journey.findByIdAndDelete(id);
    if (!result) return res.status(404).json({ error: "Journey not found" });
    res.status(200).json({ message: "Journey deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:journeyId/:checkpointId/delete", async (req, res) => {
  const { journeyId, checkpointId } = req.params;

  try {
    const journey = await Journey.findById(journeyId);
    if (!journey) return res.status(404).json({ error: "Journey not found" });
    const checkpoint = journey.checkpoints.find((c) => c.id === checkpointId);
    if (checkpoint) {
      journey.checkpoints = journey.checkpoints.filter(
        (c) => c._id.toString() !== checkpointId
      );
      journey.totalDistance = Math.max(
        0,
        journey.totalDistance - checkpoint.distance
      );
      journey.totalDuration = Math.max(
        0,
        journey.totalDuration - checkpoint.duration
      );

      await journey.save();
      return res
        .status(200)
        .json({ message: "Checkpoint delted successfully" });
    }
    res.status(404).json({ error: "Checkpoint not found" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
export default router;
