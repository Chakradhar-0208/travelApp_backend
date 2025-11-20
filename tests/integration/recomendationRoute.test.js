import request from "supertest";
import mongoose from "mongoose";
import { expect, describe } from "vitest";
import app from "../..";
import User from "../../models/User";
import Trip from "../../models/Trip";

let fakeCache = {};
let mockUserId;

// Mock Authentication
vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: mockUserId };
        next();
    }
}));

// Mock Cache
vi.mock("../../utils/recommendationCache.js", () => ({
    getCache: (key) => fakeCache[key],
    setCache: (key, val) => (fakeCache[key] = val)
}));

const makeTrip = (overrides = {}) => ({
    title: "Test Trip",
    description: "A fun trek",
    keywords: ["hills"],

    startPoint: {
        name: "Start",
        location: { type: "Point", coordinates: [80.1, 17.2] },
    },

    endPoint: {
        name: "End",
        location: { type: "Point", coordinates: [81.1, 18.1] },
    },

    distance: 50,
    duration: 3,

    estimatedCost: {
        car: {
            fuel: 200,
            tolls: 100,
            total: 500,
        },
        bike: {
            fuel: 100,
            tolls: 50,
            total: 200,
        },
    },

    rating: 4.5,
    reviewCount: 10,
    difficulty: "moderate",

    imageURLs: ["img1.jpg"],
    altitudeSickness: false,
    status: "active",

    roadInfo: {
        highways: ["NH44"],
        ghats: [],
        roadCondition: "good",
        traffic: "moderate",
    },

    checkPoints: [
        {
            name: "CP1",
            location: { type: "Point", coordinates: [80.2, 17.3] }
        },
    ],

    informativePlaces: {
        restaurants: [],
        accommodations: [],
        hospitals: [],
        policeStations: [],
        fuelStations: [],
        vehicleService: [],
    },

    journeyKit: [
        { item: "Water", necessity: "essential" }
    ],

    tollGates: [
        {
            name: "TG1",
            location: { type: "Point", coordinates: [80.3, 17.4] },
            cost: 50
        }
    ],

    precautions: ["Stay hydrated"],

    createdBy: new mongoose.Types.ObjectId(),

    ...overrides,
});

beforeEach(() => {
    mockUserId = new mongoose.Types.ObjectId().toString();
});

describe("GET /api/v1/recommendations", () => {

    test("returns 404 if user not found", async () => {
        const res = await request(app)
            .get("/api/v1/recommendations?lat=10&lng=20");

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("User not found");
    });

    test("returns cached recommendations when cache exists", async () => {
        fakeCache[`cache_${mockUserId}_20_10_undefined_undefined`] = [
            { title: "Cached Trip", recommendationScore: 99 }
        ];

        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass"
        });

        const res = await request(app)
            .get(`/api/v1/recommendations?lat=10&lng=20`);

        expect(res.status).toBe(200);
        expect(res.body.recommendations[0].title).toBe("Cached Trip");
    });

    test("computes scores and returns recommendations on cache MISS", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass",
            preferences: {
                altitudeSickness: false,
                tripDifficulty: "moderate"
            },
            interests: ["hills"]
        });

        await Trip.create(makeTrip({ title: "Hill Trek" }));

        const res = await request(app)
            .get(`/api/v1/recommendations?lat=17.1&lng=80.0&budget=3000&duration=5`);

        expect(res.status).toBe(200);
        const trip = res.body.recommendations[0];
        expect(trip.title).toBe("Hill Trek");
        expect(trip.recommendationScore).toBeGreaterThan(0);
        expect(fakeCache[`cache_${mockUserId}_80.0_17.1_3000_5`]).toBeDefined();
    });

    test("returns sorted recommendations by score", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass",
            preferences: { tripDifficulty: "easy" }
        });

        // Lower score trip
        await Trip.create(makeTrip({
            title: "Low Trip",
            difficulty: "easy",
        }));

        // Higher score trip
        await Trip.create(makeTrip({
            title: "High Trip",
            difficulty: "hard",
        }));

        const res = await request(app)
            .get("/api/v1/recommendations?lat=17&lng=80&budget=5000&duration=10");

        expect(res.status).toBe(200);
        expect(res.body.recommendations[0].title).toBe("Low Trip");
        expect(res.body.recommendations[1].title).toBe("High Trip");
    });

    test("handles missing optional query params gracefully", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass"
        });

        await Trip.create(makeTrip({ title: "A Trip" }));

        const res = await request(app).get("/api/v1/recommendations");

        expect(res.status).toBe(200);
        expect(res.body.recommendations.length).toBe(1);
    });

});
