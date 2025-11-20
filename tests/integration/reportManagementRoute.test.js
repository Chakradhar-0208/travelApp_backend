import request from "supertest";
import mongoose from "mongoose";
import app from "../..";
import User from "../../models/User";
import Report from "../../models/Report";
import Trip from "../../models/Trip";
import Review from "../../models/Review";

let mockUserId = "";
let fakeAuthUser = {};

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = fakeAuthUser;
        next();
    }
}));

const makeTrip = (overrides = {}) => ({
    title: "Test Trip",
    description: "A test trip",
    startPoint: {
        name: "Start",
        location: { type: "Point", coordinates: [80.1, 17.2] }
    },
    endPoint: {
        name: "End",
        location: { type: "Point", coordinates: [80.5, 17.5] }
    },
    distance: 10,
    duration: 2,

    estimatedCost: {
        car: { fuel: 100, tolls: 50, total: 200 },
        bike: { fuel: 50, tolls: 20, total: 100 }
    },

    rating: 4,
    reviewCount: 5,
    difficulty: "easy",
    imageURLs: ["test.jpg"],
    status: "active",

    roadInfo: {
        highways: ["NH44"],
        ghats: [],
        roadCondition: "good",
        traffic: "moderate"
    },

    checkPoints: [],

    informativePlaces: {
        restaurants: [],
        accommodations: [],
        hospitals: [],
        policeStations: [],
        fuelStations: [],
        vehicleService: []
    },

    journeyKit: [{ item: "Water", necessity: "essential" }],
    tollGates: [],

    createdBy: new mongoose.Types.ObjectId(),

    ...overrides,
});

const makeReview = (tripId, userId, overrides = {}) => ({
  user: userId,
  trip: tripId,
  rating: 5,
  comment: "Amazing trip!",
  checkpoints: [{ name: "CP1" }],
  ...overrides,
});

beforeEach(() => {
    mockUserId = new mongoose.Types.ObjectId().toString();
    fakeAuthUser = { userId: mockUserId };
});

describe("POST /api/v1/reports/user", () => {

    test("returns 400 if user tries to report themselves", async () => {
        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({
                target: mockUserId,
                reason: "spam",
                description: "self report"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("You cannot report yourself.");
    });

    test("returns 404 if target user does not exist", async () => {
        const randomId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({
                target: randomId,
                reason: "abuse",
                description: "no such user"
            });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Target user not found.");
    });

    test("returns 400 if duplicate report exists", async () => {
        const targetId = new mongoose.Types.ObjectId().toString();

        await User.create({
            _id: targetId,
            name: "Target User",
            email: "t@t.com",
            password: "pass"
        });

        await Report.create({
            type: "User",
            target: targetId,
            reportedBy: mockUserId,
            reason: "abuse"
        });

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({
                target: targetId,
                reason: "abuse",
                description: "duplicate"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Already reported.");
    });

    test("creates report successfully", async () => {
        const targetId = new mongoose.Types.ObjectId().toString();

        await User.create({
            _id: targetId,
            name: "Target User",
            email: "t@t.com",
            password: "pass"
        });

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({
                target: targetId,
                reason: "harassment",
                description: "he said bad words"
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("User report created.");

        const reports = await Report.find();
        expect(reports.length).toBe(1);
        expect(reports[0].target.toString()).toBe(targetId);
        expect(reports[0].reportedBy.toString()).toBe(mockUserId);
    });

    test("returns 400 on missing fields", async () => {
        const targetId = new mongoose.Types.ObjectId().toString();

        await User.create({
            _id: targetId,
            name: "Target User",
            email: "test@test.com",
            password: "pass"
        });

        const res = await request(app)
            .post("/api/v1/reports/user")
            .send({
                target: targetId,
                // reason missing
                description: "oops"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined(); // mongoose validation error
    });

});

describe("POST /api/v1/reports/trip", () => {

    test("returns 404 if trip not found", async () => {
        const randomId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({
                target: randomId,
                reason: "dangerous",
                description: "no such trip"
            });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Target trip not found.");
    });

    test("returns 400 if duplicate report exists", async () => {
        const trip = await Trip.create(makeTrip());

        await Report.create({
            type: "Trip",
            target: trip._id,
            reportedBy: mockUserId,
            reason: "duplicate"
        });

        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({
                target: trip._id,
                reason: "duplicate",
                description: "already reported"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Already reported.");
    });

    test("creates report successfully", async () => {
        const trip = await Trip.create(makeTrip());

        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({
                target: trip._id,
                reason: "unsafe",
                description: "bad road"
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Trip report created.");

        const reports = await Report.find();
        expect(reports.length).toBe(1);
        expect(reports[0].target.toString()).toBe(trip._id.toString());
        expect(reports[0].reportedBy.toString()).toBe(mockUserId);
    });

    test("returns 400 on validation failure", async () => {
        const trip = await Trip.create(makeTrip());

        // no reason, no description (required by schema)
        const res = await request(app)
            .post("/api/v1/reports/trip")
            .send({
                target: trip._id
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

});

describe("POST /api/v1/reports/review", () => {

    test("returns 404 if review not found", async () => {
        const randomId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({
                target: randomId,
                reason: "spam",
                description: "no such review",
            });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Target review not found.");
    });

    test("returns 400 if duplicate report exists", async () => {
        const trip = await Trip.create(makeTrip());

        const review = await Review.create(
            makeReview(trip._id, mockUserId)
        );

        await Report.create({
            type: "Review",
            target: review._id,
            reportedBy: mockUserId,
            reason: "spam",
        });

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({
                target: review._id,
                reason: "spam",
                description: "duplicate",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Already reported.");
    });

    test("creates review report successfully", async () => {
        const trip = await Trip.create(makeTrip());

        const review = await Review.create(
            makeReview(trip._id, mockUserId)
        );

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({
                target: review._id,
                reason: "abusive",
                description: "bad language",
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Review report created.");

        const reports = await Report.find();
        expect(reports.length).toBe(1);
        expect(reports[0].target.toString()).toBe(review._id.toString());
        expect(reports[0].reportedBy.toString()).toBe(mockUserId);
    });

    test("returns 400 on missing required fields", async () => {
        const trip = await Trip.create(makeTrip());
        const review = await Review.create(makeReview(trip._id, mockUserId));

        const res = await request(app)
            .post("/api/v1/reports/review")
            .send({
                target: review._id,
                // Missing reason + description
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

});