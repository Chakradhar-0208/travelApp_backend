import express from "express";
import authenticateToken from "../middlewares/auth.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import admin from "../config/firebase.js";

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({
            count: notifications.length,
            notifications
        })
    } catch (error) {
        console.error(error);

        res.status(500).json({ message: "Internal Server Error" });
    }
});

router.post("/subscribe", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { fcmToken, preferences } = req.body;

        if (!fcmToken) {
            return res.status(400).json({ message: "fcmToken is Required" });
        }

        const updateData = { fcmToken };

        if (preferences) {
            updateData.preferences = { ...preferences };
        }

        const user = await User.findByIdAndUpdate(req.user.userId, updateData, { new: true });

        res.status(200).json({ message: "Subscribed Successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

router.post("/send", authenticateToken, async (req, res) => {
    try {
        const { title, description, type } = req.body;

        if (!title || !description || !type) return res.status(400).json({ message: "Some fields are missing" });

        const validTypes = ["tripSuggestions", "checkpointAlerts", "systemUpdates"];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: "Invalid type" });
        }

        const userId = req.user.userId;

        const user = await User.findById(userId);

        const fcmToken = user.fcmToken;

        if (fcmToken == "null" || !fcmToken || typeof fcmToken !== "string" || fcmToken.length < 100)
            return res.status(400).json({ message: "Invalid fcmToken" });

        if (!user.preferences[type]) {
            return res.status(403).json({ message: "User does not accept theese notifications" });
        }

        const message = {
            userId: userId,
            title: title,
            description: description,
            type: type,
        }

        const notification = new Notification(message);

        await admin.messaging().send({
            token: fcmToken,
            notification: {
                title: title,
                body: description
            },
        });

        await notification.save();

        res.status(200).json({ message: "Message sent Successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

export default router; 