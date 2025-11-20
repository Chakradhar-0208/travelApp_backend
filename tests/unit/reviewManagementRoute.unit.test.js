import request from "supertest";
import { describe, test, expect, beforeEach, vi } from "vitest";
import app from "../../index.js";

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: "mockUser", role: "user" };
        next();
    },
}));

vi.mock("../../utils/caching/reviewCache.js", () => ({
    getCache: vi.fn(),
    setCache: vi.fn(),
    invalidateReviewCache: vi.fn(),
}));

vi.mock("../../config/cloudinary.js", () => ({
    default: {
        api: {
            delete_resources_by_prefix: vi.fn().mockResolvedValue(true),
        },
    },
}));

vi.mock("../../utils/cloudinaryUpload.js", () => ({
    uploadToCloudinary: vi.fn().mockResolvedValue({ secure_url: "mock_url" }),
}));

vi.mock("../../middlewares/multer.js", () => ({
    __esModule: true,
    default: {
        single: () => (req, res, next) => {
            req.file = null;
            next();
        },
        array: () => (req, res, next) => {
            req.files = [];
            next();
        },
    },
}));

vi.mock("../../models/Review.js", () => {
    const save = vi.fn().mockResolvedValue(true);

    const Review = vi.fn(function (data) {
        Object.assign(this, data);
        this.save = save;
        this.votes = this.votes || [];
    });

    Review.find = vi.fn(() => ({
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ rating: 5, comment: "Nice" }]),
    }));

    Review.countDocuments = vi.fn().mockResolvedValue(1);

    Review.findOne = vi.fn(() => ({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn(),
    }));

    Review.findById = vi.fn();
    Review.findByIdAndDelete = vi.fn().mockResolvedValue(true);

    return { default: Review };
});

import Review from "../../models/Review.js";
import { getCache } from "../../utils/caching/reviewCache.js";

beforeEach(() => vi.clearAllMocks());


// ----------------------------
// GET /reviews (Base Route)
// ----------------------------
describe("GET /api/v1/reviews", () => {
    test("should be active", async () => {
        const res = await request(app).get("/api/v1/reviews");
        expect(res.status).toBe(200);
        expect(res.text).toBe("Review Management Route Active");
    });
});


// ----------------------------
// GET /reviews/:tripId
// ----------------------------
describe("GET /api/v1/reviews/:tripId", () => {
    test("should return cached data", async () => {
        getCache.mockReturnValueOnce({ reviews: [], total: 0 });

        const res = await request(app).get("/api/v1/reviews/123");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
    });

    test("should return DB data", async () => {
        getCache.mockReturnValueOnce(null);

        const res = await request(app).get("/api/v1/reviews/123");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
    });
});


// ----------------------------
// GET /reviews/:tripId/:reviewId
// ----------------------------
describe("GET /api/v1/reviews/:tripId/:reviewId", () => {
    test("should return cached review", async () => {
        getCache.mockReturnValueOnce({ review: { rating: 4 } });

        const res = await request(app).get("/api/v1/reviews/123/abc");
        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
    });

    test("should return 404 if review not found", async () => {
        getCache.mockReturnValueOnce(null);

        Review.findOne.mockReturnValueOnce({
            populate: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(null),
        });

        const res = await request(app).get("/api/v1/reviews/123/abc");
        expect(res.status).toBe(404);
    });

    test("should return DB review", async () => {
        getCache.mockReturnValueOnce(null);

        Review.findOne.mockReturnValueOnce({
            populate: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue({ rating: 5 }),
        });

        const res = await request(app).get("/api/v1/reviews/123/abc");
        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
    });
});


// ----------------------------
// POST /reviews/:tripId
// ----------------------------
describe("POST /api/v1/reviews/:tripId", () => {
    test("should return 400 for missing fields", async () => {
        const res = await request(app).post("/api/v1/reviews/123").send({});
        expect(res.status).toBe(400);
    });

    test("should block duplicate reviews", async () => {
        Review.findOne.mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue({}),
        });

        const res = await request(app).post("/api/v1/reviews/123").send({ rating: 5 });
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("One review per trip per user");
    });

    test("should create a new review", async () => {
        Review.findOne.mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue(null),
        });

        const res = await request(app).post("/api/v1/reviews/123").send({ rating: 5 });
        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Review created successfully");
    });
});


// ----------------------------
// PUT /reviews/:tripId/:reviewId/update
// ----------------------------
describe("PUT /api/v1/reviews/:tripId/:reviewId/update", () => {
    test("should return 404 when review not found", async () => {
        Review.findById.mockResolvedValueOnce(null);

        const res = await request(app)
            .put("/api/v1/reviews/123/abc/update")
            .send({ rating: 4 });

        expect(res.status).toBe(404);
    });

    test("should block unauthorized user", async () => {
        Review.findById.mockResolvedValueOnce({
            user: "otherUser",
            trip: "123",
            save: vi.fn(),
        });

        const res = await request(app)
            .put("/api/v1/reviews/123/abc/update")
            .send({ rating: 4 });

        expect(res.status).toBe(403);
    });

    test("should update successfully", async () => {
        Review.findById.mockResolvedValueOnce({
            user: "mockUser",
            trip: "123",
            save: vi.fn().mockResolvedValue(true),
        });

        const res = await request(app)
            .put("/api/v1/reviews/123/abc/update")
            .send({ rating: 4 });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Review updated successfully");
    });
});


// ----------------------------
// PUT /reviews/:tripId/:reviewId/voting
// ----------------------------
describe("PUT /api/v1/reviews/:tripId/:reviewId/voting", () => {
    test("should return 404 when review not found", async () => {
        Review.findById.mockResolvedValueOnce(null);

        const res = await request(app)
            .put("/api/v1/reviews/123/abc/voting")
            .send({ userVote: "up" });

        expect(res.status).toBe(404);
    });

    test("should reject invalid vote", async () => {
        Review.findById.mockResolvedValueOnce({
            trip: "123",
            votes: [],
            upVotes: 0,
            downVotes: 0,
            save: vi.fn(),
        });

        const res = await request(app)
            .put("/api/v1/reviews/123/abc/voting")
            .send({ userVote: "sideways" });

        expect(res.status).toBe(400);
    });

    test("should handle vote successfully", async () => {
        Review.findById.mockResolvedValueOnce({
            trip: "123",
            votes: [],
            upVotes: 0,
            downVotes: 0,
            save: vi.fn().mockResolvedValue(true),
        });

        const res = await request(app)
            .put("/api/v1/reviews/123/abc/voting")
            .send({ userVote: "up" });

        expect(res.status).toBe(200);
    });
});


// ----------------------------
// DELETE /reviews/:tripId/:reviewId
// ----------------------------
describe("DELETE /api/v1/reviews/:tripId/:reviewId", () => {
    test("should return 404 when review not found", async () => {
        Review.findById.mockResolvedValueOnce(null);

        const res = await request(app).delete("/api/v1/reviews/123/abc");
        expect(res.status).toBe(404);
    });

    test("should block unauthorized user", async () => {
        Review.findById.mockResolvedValueOnce({
            user: "otherUser",
        });

        const res = await request(app).delete("/api/v1/reviews/123/abc");
        expect(res.status).toBe(403);
    });

    test("should delete successfully", async () => {
        Review.findById.mockResolvedValueOnce({
            user: "mockUser",
        });

        const res = await request(app).delete("/api/v1/reviews/123/abc");

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Review deleted successfully");
    });
});
