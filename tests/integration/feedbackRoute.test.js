import { uploadToCloudinaryFeedback } from "../../utils/cloudinaryUpload";

import request from "supertest";
import mongoose from "mongoose";
import app from "../..";
import Feedback from "../../models/Feedback";

let mockUserId = new mongoose.Types.ObjectId();

// Mock auth to inject userId
vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: mockUserId.toString() };
        next();
    }
}));

vi.mock("../../utils/cloudinaryUpload.js", () => ({
    uploadToCloudinaryFeedback: vi.fn().mockResolvedValue({
        secure_url: "https://fake.cloud/image.png"
    })
}));

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

describe("POST /api/v1/feedback", () => {

    test("returns 400 for invalid type", async () => {
        const res = await request(app)
            .post("/api/v1/feedback")
            .field("type", "nonsense")
            .field("category", "UI glitch")
            .field("description", "Something broke")
            .field("deviceInfo", JSON.stringify({ platform: "Android", version: "12", model: "Pixel" }));

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid type");
    });

    test("returns 400 when required fields are missing", async () => {
        const res = await request(app)
            .post("/api/v1/feedback")
            .field("type", "bug")
            .field("category", "")
            .field("description", "")
            .field("deviceInfo", "{}");

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("All fields are required");
    });

    test("creates feedback successfully without screenshots", async () => {
        const res = await request(app)
            .post("/api/v1/feedback")
            .field("type", "bug")
            .field("category", "UI")
            .field("description", "Button not clickable")
            .field("deviceInfo", JSON.stringify({
                platform: "Android",
                version: "12",
                model: "Pixel 6"
            }));
        expect(res.status).toBe(200);
        expect(res.body.feedback.userId).toBe(mockUserId.toString());

        const fb = await Feedback.findOne({});
        expect(fb).not.toBeNull();
        expect(fb.type).toBe("bug");
        expect(fb.screenshots.length).toBe(0);
    });

    test("uploads screenshots and saves URLs", async () => {
        const res = await request(app)
            .post("/api/v1/feedback")
            .field("type", "ui")
            .field("category", "Layout issue")
            .field("description", "Alignment off")
            .field("deviceInfo", JSON.stringify({
                platform: "iOS",
                version: "16",
                model: "iPhone 14"
            }))
            .attach("screenshots", Buffer.from("dummy file"), "screenshot1.png")
            .attach("screenshots", Buffer.from("dummy file"), "screenshot2.png");

        expect(res.status).toBe(200);

        const fb = await Feedback.findOne({});
        expect(fb).not.toBeNull();

        // Cloudinary upload should be called twice
        expect(uploadToCloudinaryFeedback).toHaveBeenCalledTimes(2);

        // Saved URLs should match mocked secure_url
        expect(fb.screenshots.length).toBe(2);
        expect(fb.screenshots[0]).toBe("https://fake.cloud/image.png");
    });
});
