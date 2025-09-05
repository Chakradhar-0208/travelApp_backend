import express from "express";
import { testingGet, testingPut } from "../controller/testingController.js";

const router = express.Router();

router.get("/", testingGet);
router.post("/", testingPut);

export default router;
