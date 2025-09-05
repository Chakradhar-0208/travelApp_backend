import express from "express";

const router = express.Router()

router.get("/", (req, res) => {
    res.json({ platform: process.platform, CPUArch: process.arch })
})

export default router;