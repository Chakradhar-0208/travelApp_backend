import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";

import Report from "../../models/Report.js";
import User from "../../models/User.js";
import Trip from "../../models/Trip.js";
import Review from "../../models/Review.js";

// ---------------------- MOCKS ---------------------- //

// Auth Middleware
vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: "mockUser" };
        next();
    },
}));

// Models
vi.mock("../../models/User.js", () => ({
    default: {
        findById: vi.fn(),
    },
}));

vi.mock("../../models/Trip.js", () => ({
    default: {
        findById: vi.fn(),
    },
}));

vi.mock("../../models/Review.js", () => ({
    default: {
        findById: vi.fn(),
    },
}));

vi.mock("../../models/Report.js", () => {
    const save = vi.fn();

    const Report = vi.fn(function (data) {
        this.data = data;
        this.save = save;
    });

    Report.findOne = vi.fn();

    return { default: Report };
});

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------- POST /report/user ---------------------- //

describe("POST /api/v1/reports/user", () => {
    test("should not allow reporting yourself", async () => {
        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({ target: "mockUser", reason: "Spam" });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("You cannot report yourself.");
    });

    test("should return 404 if target user not found", async () => {
        User.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue(null),
        });

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({ target: "user123", reason: "Spam" });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Target user not found.");
    });

    test("should prevent duplicate user report", async () => {
        User.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ _id: "user123" }),
        });

        Report.findOne.mockResolvedValueOnce({ _id: "existingReport" });

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({ target: "user123", reason: "Spam" });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Already reported.");
    });

    test("should create a new user report", async () => {
        User.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ _id: "user123" }),
        });

        Report.findOne.mockResolvedValueOnce(null);
        Report.prototype.save = vi.fn().mockResolvedValue(true);

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({
                target: "user123",
                reason: "Harassment",
                description: "Bad behaviour",
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toBe("User report created.");
    });
});

// ---------------------- POST /report/trip ---------------------- //

describe("POST /api/v1/reports/trip", () => {
    test("should return 404 if target trip not found", async () => {
        Trip.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue(null),
        });

        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({ target: "trip123", reason: "Spam" });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Target trip not found.");
    });

    test("should prevent duplicate trip report", async () => {
        Trip.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ _id: "trip123" }),
        });

        Report.findOne.mockResolvedValueOnce({});

        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({ target: "trip123", reason: "Illegal" });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Already reported.");
    });

    test("should create a trip report", async () => {
        Trip.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ _id: "trip123" }),
        });

        Report.findOne.mockResolvedValueOnce(null);
        Report.prototype.save = vi.fn().mockResolvedValue(true);

        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({ target: "trip123", reason: "Safety Issue" });

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toBe("Trip report created.");
    });
});

// ---------------------- POST /report/review ---------------------- //

describe("POST /api/v1/reports/review", () => {
    test("should return 404 if target review not found", async () => {
        Review.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue(null),
        });

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({ target: "review123", reason: "Spam" });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe("Target review not found.");
    });

    test("should prevent duplicate review report", async () => {
        Review.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ _id: "review123" }),
        });

        Report.findOne.mockResolvedValueOnce({ _id: "existing" });

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({ target: "review123", reason: "Toxic" });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe("Already reported.");
    });

    test("should create a review report", async () => {
        Review.findById.mockReturnValueOnce({
            select: vi.fn().mockResolvedValue({ _id: "review123" }),
        });

        Report.findOne.mockResolvedValueOnce(null);
        Report.prototype.save = vi.fn().mockResolvedValue(true);

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({ target: "review123", reason: "Fake Review" });

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toBe("Review report created.");
    });
});
