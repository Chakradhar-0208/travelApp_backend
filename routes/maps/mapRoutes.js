import express from "express";
import nearbyController from "../../controllers/mapControllers/nearbyController.js"
import routeController from "../../controllers/mapControllers/routeController.js"

const router = express.Router();

router.get("/nearby", nearbyController);

router.get("/route", routeController);

export default router;