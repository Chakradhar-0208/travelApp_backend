import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";

vi.mock("../../middlewares/auth.js", () => ({
    default: vi.fn((req, _, next) => {
        req.user = { userId: "user123" };
        next();
    }),
}));

const sendMock = vi.fn();

vi.mock("../../models/Notification.js", () => {
    const saveMock = vi.fn();

    function MockNotification(data) {
        Object.assign(this, data);
        this.save = saveMock;
    }

    MockNotification.find = vi.fn(() => ({
        sort: vi.fn().mockResolvedValue([]),
    }));

    return { default: MockNotification, saveMock };
});

vi.mock("../../models/User.js", () => ({
    default: {
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
    },
}));

vi.mock("../../config/firebase.js", () => ({
    default: {
        messaging: () => ({
            send: sendMock,
        }),
    },
}));

import Notification, { saveMock } from "../../models/Notification.js";
import User from "../../models/User.js";

beforeEach(() => vi.clearAllMocks());

// ---------------------- GET /api/v1/notifications/ ---------------------- //

describe("GET /api/v1/notifications/", () => {
    test("should return user's notifications", async () => {
        Notification.find.mockReturnValueOnce({
            sort: vi.fn().mockResolvedValueOnce([
                { title: "Hello", createdAt: new Date() }
            ])
        });

        const res = await request(app).get("/api/v1/notifications/");
        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(1);
    });

    test("should return 500 on internal error", async () => {
        Notification.find.mockImplementationOnce(() => {
            throw new Error("DB error");
        });

        const res = await request(app).get("/api/v1/notifications/");
        expect(res.statusCode).toBe(500);
    });
});

// ---------------------- POST /api/v1/notifications/subscribe ---------------------- //

describe("POST /api/v1/notifications/subscribe", () => {
    test("should return 400 if fcmToken missing", async () => {
        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({});

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("fcmToken is Required");
    });

    test("should save fcmToken", async () => {
        User.findByIdAndUpdate.mockResolvedValueOnce({ id: "user123" });

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({ fcmToken: "validTokenXYZ" });

        expect(res.statusCode).toBe(200);
        expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });

    test("should return 500 on DB error", async () => {
        User.findByIdAndUpdate.mockRejectedValueOnce(new Error("DB fail"));

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({ fcmToken: "valid" });

        expect(res.statusCode).toBe(500);
    });
});

// ---------------------- POST /api/v1/notifications/send ---------------------- //

describe("POST /api/v1/notifications/send", () => {
    test("should return 400 for missing fields", async () => {
        const res = await request(app)
            .post("/api/v1/notifications/send")
            .send({ title: "Hello" });

        expect(res.statusCode).toBe(400);
    });

    test("should return 400 for invalid type", async () => {
        const res = await request(app)
            .post("/api/v1/notifications/send")
            .send({
                title: "Title",
                description: "Desc",
                type: "invalidType",
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Invalid type");
    });

    test("should return 400 for invalid fcmToken", async () => {
        User.findById.mockResolvedValueOnce({
            fcmToken: "123",
            preferences: { tripSuggestions: true },
        });

        const res = await request(app)
            .post("/api/v1/notifications/send")
            .send({
                title: "test",
                description: "test",
                type: "tripSuggestions",
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Invalid fcmToken");
    });

    test("should block if user preference disabled", async () => {
        User.findById.mockResolvedValueOnce({
            fcmToken: "f".repeat(160),
            preferences: { tripSuggestions: false },
        });

        const res = await request(app)
            .post("/api/v1/notifications/send")
            .send({
                title: "T",
                description: "D",
                type: "tripSuggestions",
            });

        expect(res.statusCode).toBe(403);
    });

    test("should send notification successfully", async () => {
        User.findById.mockResolvedValueOnce({
            fcmToken: "f".repeat(160),
            preferences: { tripSuggestions: true },
        });

        sendMock.mockResolvedValueOnce("ok");

        const saveSpy = saveMock.mockResolvedValueOnce(true);

        const res = await request(app)
            .post("/api/v1/notifications/send")
            .send({
                title: "Title",
                description: "Description",
                type: "tripSuggestions",
            });

        expect(res.statusCode).toBe(200);
        expect(sendMock).toHaveBeenCalledTimes(1);
        expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    test("should return 500 on firebase error", async () => {
        User.findById.mockResolvedValueOnce({
            fcmToken: "f".repeat(160),
            preferences: { tripSuggestions: true },
        });

        sendMock.mockRejectedValueOnce(new Error("Firebase fail"));

        const res = await request(app)
            .post("/api/v1/notifications/send")
            .send({
                title: "X",
                description: "Y",
                type: "tripSuggestions",
            });

        expect(res.statusCode).toBe(500);
    });
});
