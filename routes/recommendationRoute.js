import express from "express";
import { getRecommendations } from "../controllers/recommendationController.js";
import authenticateToken  from "../middlewares/auth.js";

const router = express.Router();

router.get("/", authenticateToken, getRecommendations);

export default router;
 