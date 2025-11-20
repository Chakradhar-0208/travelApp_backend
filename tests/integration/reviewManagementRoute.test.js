import request from "supertest";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import app from "../../index.js";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload.js";
import { invalidateReviewCache } from "../../utils/caching/reviewCache.js";
import cloudinary from "../../config/cloudinary.js";
import Review from "../../models/Review.js";
import User from "../../models/User.js";
import Trip from "../../models/Trip.js";

let fakeCache = {};
let mockUserId = new mongoose.Types.ObjectId();
let mockRole = "user";

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: mockUserId.toString(), role: mockRole };
        next();
    },
}));

vi.mock("../../config/cloudinary.js", () => ({
    default: {
        api: {
            delete_resources_by_prefix: vi.fn().mockResolvedValue(true),
        },
        uploader: {
            upload_stream: vi.fn((opts, cb) => {
                cb(null, { public_id: "mock_public_id" });
                return { end: vi.fn() };
            }),
        },
    }
}));

vi.mock("../../utils/cloudinaryUpload.js", () => ({
    uploadToCloudinary: vi.fn().mockResolvedValue({
        secure_url: "https://cloud.fake/review.jpg"
    }),
}));

vi.mock("../../utils/caching/reviewCache.js", () => {
    return {
        getCache: (key) => fakeCache[key],
        setCache: (key, val) => (fakeCache[key] = val),
        invalidateReviewCache: vi.fn(),
    };
});

afterEach(() => {
    vi.clearAllMocks();
});


describe("GET /api/v1/reviews/:tripId", () => {

    test("returns reviews from DB on cache miss and sets cache", async () => {

        const user = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
        });

        const trip = await Trip.create({
            title: "Test Trip",
            description: "Nice trip",
            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [80, 17] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [81, 18] }
            },
            distance: 20,
            duration: 2,
            estimatedCost: {
                car: { fuel: 100, tolls: 20 },
                bike: { fuel: 80, tolls: 10 }
            }
        });

        await Review.create({
            user: user._id,
            trip: trip._id,
            rating: 5,
            comment: "Amazing!",
            checkpoints: [{ name: "CP1" }]
        });

        const res = await request(app)
            .get(`/api/v1/reviews/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");

        expect(res.body.reviews.length).toBe(1);
        expect(res.body.total).toBe(1);

        // populated user fields
        expect(res.body.reviews[0].user.name).toBe("Kiran");

        // cache must be set
        const cacheKey = `reviews:trip-${trip._id}`;
        expect(fakeCache[cacheKey]).toBeDefined();
        expect(fakeCache[cacheKey].total).toBe(1);
    });

    test("returns cached data when cache exists", async () => {

        const tripId = new mongoose.Types.ObjectId().toString();

        fakeCache[`reviews:trip-${tripId}`] = {
            reviews: [
                { rating: 4, comment: "Cached review!" }
            ],
            total: 1
        };

        const res = await request(app)
            .get(`/api/v1/reviews/${tripId}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");

        expect(res.body.reviews[0].comment).toBe("Cached review!");
    });

    test("returns empty results when no reviews exist", async () => {

        const tripId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .get(`/api/v1/reviews/${tripId}`);

        expect(res.status).toBe(200);
        expect(res.body.reviews.length).toBe(0);
        expect(res.body.total).toBe(0);
    });

    test("returns reviews sorted by createdAt desc", async () => {

        const user = await User.create({
            name: "Max",
            email: "max@rb.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Trek",
            description: "xyz",
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            distance: 10,
            duration: 1,
            estimatedCost: {
                car: { fuel: 20, tolls: 5 },
                bike: { fuel: 10, tolls: 2 }
            }
        });

        await Review.create({
            user: user._id,
            trip: trip._id,
            rating: 4,
            comment: "Older",
            checkpoints: [{ name: "CP1" }],
            createdAt: new Date(Date.now() - 5000)
        });

        await Review.create({
            user: user._id,
            trip: trip._id,
            rating: 5,
            comment: "Newer",
            checkpoints: [{ name: "CP1" }],
            createdAt: new Date()
        });

        const res = await request(app)
            .get(`/api/v1/reviews/${trip._id}`);

        expect(res.status).toBe(200);

        const [first] = res.body.reviews;
        expect(first.comment).toBe("Newer");
    });

});

describe("GET /api/v1/reviews/:tripId/:reviewId", () => {

    test("returns detailed review from DB on cache miss and sets cache", async () => {

        const user = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            profileImage: "pic.jpg",
        });

        const trip = await Trip.create({
            title: "Test Trip",
            description: "Desc",
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            distance: 10,
            duration: 1,
            estimatedCost: {
                car: { fuel: 10, tolls: 5 },
                bike: { fuel: 5, tolls: 2 }
            }
        });

        const review = await Review.create({
            user: user._id,
            trip: trip._id,
            rating: 5,
            comment: "Fantastic!",
            checkpoints: [{ name: "CP1" }]
        });

        const res = await request(app)
            .get(`/api/v1/reviews/${trip._id}/${review._id}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");

        // Populated fields
        expect(res.body.review.user.name).toBe("Kiran");

        // Cache must be set
        const key = `review:${review._id}`;
        expect(fakeCache[key]).toBeDefined();
        expect(fakeCache[key].review.comment).toBe("Fantastic!");
    });

    test("returns cached review when cache exists", async () => {
        const tripId = new mongoose.Types.ObjectId().toString();
        const reviewId = new mongoose.Types.ObjectId().toString();

        fakeCache[`review:${reviewId}`] = {
            review: { comment: "Cached Review", rating: 4 }
        };

        const res = await request(app)
            .get(`/api/v1/reviews/${tripId}/${reviewId}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.review.comment).toBe("Cached Review");
    });

    test("returns 404 when review does not exist", async () => {
        const tripId = new mongoose.Types.ObjectId().toString();
        const reviewId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .get(`/api/v1/reviews/${tripId}/${reviewId}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Review not found");
    });

    test("returns 404 when review exists but tripId mismatches", async () => {

        const realTrip = await Trip.create({
            title: "Real Trip",
            description: "xyz",
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            distance: 10,
            duration: 1,
            estimatedCost: {
                car: { fuel: 10, tolls: 5 },
                bike: { fuel: 5, tolls: 2 }
            }
        });

        const otherTripId = new mongoose.Types.ObjectId().toString();

        const user = await User.create({
            name: "Test User",
            email: "a@test.com",
            password: "pass"
        });

        const review = await Review.create({
            user: user._id,
            trip: realTrip._id,
            rating: 5,
            comment: "Mismatch test"
        });

        const res = await request(app)
            .get(`/api/v1/reviews/${otherTripId}/${review._id}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Review not found");
    });

});

describe("POST /api/v1/reviews/:tripId", () => {

    test("returns 400 if required fields missing", async () => {
        const tripId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .send({ comment: "Nice", checkpoints: "[]" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Required fields missing");
    });

    test("returns 400 if user already reviewed this trip", async () => {
        const userId = mockUserId;
        const tripId = new mongoose.Types.ObjectId();

        await Review.create({
            user: userId,
            trip: tripId,
            rating: 4,
            comment: "Already reviewed"
        });

        const res = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .send({ rating: 5 });
        console.log(res.error)
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("One review per trip per user");
    });

    test("creates review successfully (no images)", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .field("rating", "5")
            .field("comment", "Amazing trip!")
            .field("checkpoints", JSON.stringify([{ name: "CP1" }]));

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Review created successfully");
        expect(res.body.review.rating).toBe(5);
        expect(res.body.review.comment).toBe("Amazing trip!");
    });

    test("creates review and uploads images in background", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .field("rating", "5")
            .attach("images", Buffer.from("fake-image-data"), "test.jpg");

        expect(res.status).toBe(201);
        expect(res.body.review._id).toBeDefined();

        // allow setImmediate to run
        await new Promise(r => setImmediate(r));

        const reviewInDb = await Review.findById(res.body.review._id);

        expect(uploadToCloudinary).toHaveBeenCalled();
        expect(reviewInDb.images.length).toBe(1);
        expect(reviewInDb.images[0]).toBe("https://cloud.fake/review.jpg");
    });

    test("ignores unknown fields from request body", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .field("rating", "3")
            .field("comment", "ok ok")
            .field("hackField", "i-should-not-exist");

        expect(res.status).toBe(201);

        const review = await Review.findById(res.body.review._id).lean();

        expect(review.hackField).toBeUndefined();
    });

    test("parses checkpoints JSON correctly", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const cps = [{ name: "Point A" }, { name: "Point B" }];

        const res = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .field("rating", "5")
            .field("checkpoints", JSON.stringify(cps));

        expect(res.status).toBe(201);

        const review = await Review.findById(res.body.review._id);

        expect(review.checkpoints.length).toBe(2);
        expect(review.checkpoints[0].name).toBe("Point A");
    });

});

describe("PUT /api/v1/reviews/:tripId/:reviewId/update", () => {

    test("returns 404 when review does not exist", async () => {
        const tripId = new mongoose.Types.ObjectId();
        const reviewId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${reviewId}/update`)
            .send({ rating: 4 });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Review not found");
    });

    test("returns 403 when user does NOT own the review", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: new mongoose.Types.ObjectId(),  // NOT mockUserId
            trip: tripId,
            rating: 3,
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/update`)
            .send({ rating: 4 });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Unauthorized");
    });

    test("returns 400 if review doesn't belong to this trip", async () => {
        const tripA = new mongoose.Types.ObjectId();
        const tripB = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripA,
            rating: 3,
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripB}/${review._id}/update`)
            .send({ rating: 5 });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Review doesn't belong to this trip");
    });

    test("updates rating, comment & checkpoints only", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 2,
            comment: "Old",
            checkpoints: [{ name: "C1" }]
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/update`)
            .send({
                rating: 5,
                comment: "New Comment",
                checkpoints: JSON.stringify([{ name: "CP2" }]),
                hackerField: "should-not-exist"
            });

        expect(res.status).toBe(200);
        expect(res.body.review.rating).toBe(5);
        expect(res.body.review.comment).toBe("New Comment");
        expect(res.body.review.checkpoints[0].name).toBe("CP2");
        expect(res.body.review.hackerField).toBeUndefined();
    });

    //! SOME CONFLICTS WITH THE ROUTE
    // test("replaces images and triggers cloudinary background job", async () => {
    //     const tripId = new mongoose.Types.ObjectId();

    //     const review = await Review.create({
    //         user: mockUserId,
    //         trip: tripId,
    //         rating: 3,
    //         images: ["old1.png"]
    //     });

    //     const res = await request(app)
    //         .put(`/api/v1/reviews/${tripId}/${review._id}/update`)
    //         .attach("images", Buffer.from("old1.png"), "old1.png")
    //         .field("rating", "4");

    //     expect(res.status).toBe(200);

    //     // wait for setImmediate
    //     await new Promise(resolve => setImmediate(resolve));

    //     expect(cloudinary.api.delete_resources_by_prefix)
    //         .toHaveBeenCalledWith(`reviews/${review._id}`);

    //     expect(uploadToCloudinary).toHaveBeenCalled();

    //     const updated = await Review.findById(review._id);
    //     expect(updated.images[0]).toBe("https://cloud.fake/review.jpg");
    // });

    test("updates review without touching images when no files provided", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 2,
            images: ["old.jpg"]
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/update`)
            .send({ rating: 4 });

        expect(res.status).toBe(200);
        expect(res.body.review.rating).toBe(4);

        // cloudinary should NOT be called
        expect(cloudinary.api.delete_resources_by_prefix).not.toHaveBeenCalled();
    });

});

describe("PUT /api/v1/reviews/:tripId/:reviewId/voting", () => {

    test("returns 404 when review does not exist", async () => {
        const tripId = new mongoose.Types.ObjectId();
        const reviewId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${reviewId}/voting`)
            .send({ userVote: "up" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Review not found");
    });

    test("returns 400 if review does not belong to the trip", async () => {
        const review = await Review.create({
            user: mockUserId,
            trip: new mongoose.Types.ObjectId(), // trip A
            rating: 4
        });

        const tripB = new mongoose.Types.ObjectId(); // trip B

        const res = await request(app)
            .put(`/api/v1/reviews/${tripB}/${review._id}/voting`)
            .send({ userVote: "up" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Review does not belong to this trip");
    });

    test("returns 400 for invalid vote type", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 3
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/voting`)
            .send({ userVote: "sideways" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid vote type");
    });

    test("first-time upvote works", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 5,
            upVotes: 0,
            downVotes: 0
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/voting`)
            .send({ userVote: "up" });

        expect(res.status).toBe(200);

        const updated = await Review.findById(review._id);

        expect(updated.upVotes).toBe(1);
        expect(updated.downVotes).toBe(0);
        expect(updated.votes[0].vote).toBe("up");
    });

    test("first-time downvote works", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 5
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/voting`)
            .send({ userVote: "down" });

        expect(res.status).toBe(200);

        const updated = await Review.findById(review._id);

        expect(updated.upVotes).toBe(0);
        expect(updated.downVotes).toBe(1);
        expect(updated.votes[0].vote).toBe("down");
    });

    test("switch up → down", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 4,
            upVotes: 1,
            downVotes: 0,
            votes: [{ userId: mockUserId, vote: "up" }]
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/voting`)
            .send({ userVote: "down" });

        expect(res.status).toBe(200);

        const updated = await Review.findById(review._id);

        expect(updated.upVotes).toBe(0);
        expect(updated.downVotes).toBe(1);
        expect(updated.votes[0].vote).toBe("down");
    });

    test("switch down → up", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 4,
            upVotes: 0,
            downVotes: 1,
            votes: [{ userId: mockUserId, vote: "down" }]
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/voting`)
            .send({ userVote: "up" });

        expect(res.status).toBe(200);

        const updated = await Review.findById(review._id);

        expect(updated.upVotes).toBe(1);
        expect(updated.downVotes).toBe(0);
        expect(updated.votes[0].vote).toBe("up");
    });

    test("remove vote when sending null", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,
            trip: tripId,
            rating: 5,
            upVotes: 1,
            downVotes: 0,
            votes: [{ userId: mockUserId, vote: "up" }]
        });

        const res = await request(app)
            .put(`/api/v1/reviews/${tripId}/${review._id}/voting`)
            .send({ userVote: null });

        expect(res.status).toBe(200);

        const updated = await Review.findById(review._id);

        expect(updated.upVotes).toBe(0);
        expect(updated.downVotes).toBe(0);
        expect(updated.votes[0].vote).toBe(null);
    });

});

describe("DELETE /api/v1/reviews/:tripId/:reviewId", () => {

    test("returns 404 when review does not exist", async () => {
        const tripId = new mongoose.Types.ObjectId();
        const reviewId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/reviews/${tripId}/${reviewId}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Review not found");
    });

    test("returns 403 when user does NOT own the review and is not admin", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: new mongoose.Types.ObjectId(),  // someone else
            trip: tripId,
            rating: 3,
        });

        const res = await request(app)
            .delete(`/api/v1/reviews/${tripId}/${review._id}`);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Unauthorized");
    });

    test("successfully deletes review and calls cloudinary cleanup", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: mockUserId,     // OWNER
            trip: tripId,
            rating: 4,
            images: ["img1.jpg", "img2.png"],
        });

        const res = await request(app)
            .delete(`/api/v1/reviews/${tripId}/${review._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Review deleted successfully");

        // ensure DB deletion
        const deleted = await Review.findById(review._id);
        expect(deleted).toBeNull();

        // ensure cloudinary cleanup triggered
        expect(cloudinary.api.delete_resources_by_prefix)
            .toHaveBeenCalledWith(`reviews/${review._id}`);

        // ensure cache invalidation called
        expect(invalidateReviewCache).toHaveBeenCalled();
    });

    test("admin can delete any review", async () => {
        // temporarily override auth mock to simulate admin
        mockRole = "admin"

        const tripId = new mongoose.Types.ObjectId();

        const review = await Review.create({
            user: new mongoose.Types.ObjectId(),
            trip: tripId,
            rating: 5,
        });

        const res = await request(app)
            .delete(`/api/v1/reviews/${tripId}/${review._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Review deleted successfully");

        const deleted = await Review.findById(review._id);
        expect(deleted).toBeNull();
    });

});
