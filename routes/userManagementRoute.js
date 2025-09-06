import express from "express";

const router = express.Router();

router.get("/profile", (req, res) => {
    res.json({status: "working"});
})

router.put("/profile", (req, res) => {});

router.get("/analytics", (req, res) => {});

router.post("/report", (req, res) => {});

export default router;