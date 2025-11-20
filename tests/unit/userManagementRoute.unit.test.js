import request from "supertest";
import { describe, test, expect, beforeEach, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = {
            userId: "mockUser",
            email: "mock@mail.com",
            role: "user"
        };
        next();
    },
}));

vi.mock("../../utils/caching/userCache.js", () => ({
    getCache: vi.fn(),
    setCache: vi.fn(),
    invalidateUserCache: vi.fn(),
}));

vi.mock("../../middlewares/multer.js", () => ({
    __esModule: true,
    default: {
        single: () => (req, res, next) => {
            req.file = { buffer: Buffer.from("mock") };
            next();
        },
        array: () => (req, res, next) => {
            req.files = [];
            next();
        },
    }
}));

vi.mock("../../config/cloudinary.js", () => ({
    default: {
        uploader: {
            upload_stream: vi.fn((opts, cb) => {
                cb(null, { public_id: "mock_public_id" });
                return { end: vi.fn() };
            }),
        },
        url: vi.fn(() => "mock_transformed_url"),
    }
}));

vi.mock("mongoose", () => {
    class FakeSchema {
        constructor(def, opts) {
            this.def = def;
            this.opts = opts;
        }
        index() { }
    }
    FakeSchema.Types = { ObjectId: { isValid: vi.fn(() => true) } };

    return {
        default: {
            Schema: FakeSchema,
            model: vi.fn(() => ({})),
            connect: vi.fn(),
            disconnect: vi.fn(),
            connection: { readyState: 1, close: vi.fn() },
            Types: { ObjectId: { isValid: vi.fn(() => true) } },
        },
    };
});

vi.mock("streamifier", () => ({
    createReadStream: () => ({
        pipe: vi.fn(),
    }),
}));

vi.mock("../../models/User.js", () => {
    const User = vi.fn(function (data) {
        Object.assign(this, data);
        this.save = vi.fn().mockResolvedValue(this);
    });

    User.findOne = vi.fn();
    User.findById = vi.fn();
    User.findByIdAndUpdate = vi.fn();
    User.deleteOne = vi.fn();
    User.create = vi.fn();

    return { default: User };
});

vi.mock("../../models/Journey.js", () => ({
    default: {
        find: vi.fn(),
    }
}));

vi.mock("../../models/Trip.js", () => ({
    default: {
        findById: vi.fn(),
    }
}));

import User from "../../models/User.js";
import Journey from "../../models/Journey.js";
import Trip from "../../models/Trip.js";
import { getCache } from "../../utils/caching/userCache.js";
import app from "../../index.js";

beforeEach(() => vi.clearAllMocks());



// ----------------------------------------------
// GET /api/v1/users/getUser
// ----------------------------------------------
describe("GET /api/v1/users/getUser", () => {
    test("should return cached user", async () => {
        getCache.mockReturnValueOnce({ user: { email: "mock@mail.com" } });

        const res = await request(app)
            .get("/api/v1/users/getUser?email=mock@mail.com");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
    });

    test("should return user from DB", async () => {
        getCache.mockReturnValueOnce(null);

        User.findOne.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            populate: vi.fn().mockReturnThis(),
            lean: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue({ email: "mock@mail.com", name: "Mock" })
        });

        const res = await request(app)
            .get("/api/v1/users/getUser?email=mock@mail.com");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
    });

    test("should block unauthorized user lookup", async () => {
        const res = await request(app)
            .get("/api/v1/users/getUser?email=other@mail.com");

        expect(res.status).toBe(403);
    });

    test("should return 404 if user not found", async () => {
        getCache.mockReturnValueOnce(null);

        User.findOne.mockReturnValue({
            select: vi.fn().mockReturnValueOnce(null),
            lean: vi.fn().mockReturnThis(),
        });

        const res = await request(app)
            .get("/api/v1/users/getUser?email=mock@mail.com");

        expect(res.status).toBe(404);
    });
});



// ----------------------------------------------
// GET /api/v1/users/savedTrips
// ----------------------------------------------
describe("GET /api/v1/users/savedTrips", () => {
    test("should return saved trips", async () => {
        User.findById.mockReturnValueOnce({
            populate: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue({
                savedTrips: [{ title: "Trip 1" }]
            })
        });

        const res = await request(app).get("/api/v1/users/savedTrips");

        expect(res.status).toBe(200);
        expect(res.body.savedTrips.length).toBe(1);
    });
});



// ----------------------------------------------
// PUT /api/v1/users/updateUser/:id
// ----------------------------------------------
describe("PUT /api/v1/users/updateUser/:id", () => {
    test("should block unauthorized update", async () => {
        const res = await request(app)
            .put("/api/v1/users/updateUser/anotherUser")
            .send({ name: "Test" });

        expect(res.status).toBe(403);
    });

    test("should update user data", async () => {
        User.findByIdAndUpdate.mockReturnValueOnce({
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue({ name: "Updated" }),
        });

        const res = await request(app)
            .put("/api/v1/users/updateUser/mockUser")
            .send({ name: "Updated" });

        expect(res.status).toBe(200);
    });
});



// ----------------------------------------------
// GET /api/v1/users/getProfileImage
// ----------------------------------------------
describe("GET /api/v1/users/getProfileImage", () => {
    test("should return cached image", async () => {
        getCache.mockReturnValueOnce({ profileImage: "cached.jpg" });

        const res = await request(app)
            .get("/api/v1/users/getProfileImage?email=mock@mail.com");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
    });

    test("should transform and return DB image", async () => {
        getCache.mockReturnValueOnce(null);

        User.findOne.mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue({ profileImage: "img123" })
        });

        const res = await request(app)
            .get("/api/v1/users/getProfileImage?email=mock@mail.com");

        expect(res.status).toBe(200);
        expect(res.body.profileImage).toBe("mock_transformed_url");
    });
});



// ----------------------------------------------
// POST /api/v1/users/createUser
// ----------------------------------------------
describe("POST /api/v1/users/createUser", () => {
    test("should create a user", async () => {
        User.create = vi.fn().mockResolvedValue({
            _id: "123",
            name: "Test",
            email: "t@mail.com",
            role: "user",
        });

        const res = await request(app)
            .post("/api/v1/users/createUser")
            .send({ name: "Test", email: "t@mail.com", password: "pass" });

        expect(res.status).toBe(201);
    });
});



// ----------------------------------------------
// DELETE /api/v1/users/deleteUser
// ----------------------------------------------
describe("DELETE /api/v1/users/deleteUser", () => {
    test("should block unauthorized delete", async () => {
        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "other@mail.com" });

        expect(res.status).toBe(403);
    });

    test("should delete user", async () => {
        User.findOne.mockReturnValueOnce({
            lean: vi.fn().mockResolvedValue({ email: "mock@mail.com" })
        });

        User.deleteOne.mockResolvedValueOnce(true);

        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "mock@mail.com" });

        expect(res.status).toBe(200);
    });
});



// ----------------------------------------------
// GET /api/v1/users/analytics
// ----------------------------------------------
describe("GET /api/v1/users/analytics", () => {
    test("should return analytics", async () => {
        Journey.find.mockResolvedValueOnce([
            { totalDistance: 100, totalDuration: 50, tripId: "t1" },
            { totalDistance: 200, totalDuration: 70, tripId: "t2" },
        ]);

        const res = await request(app).get("/api/v1/users/analytics");

        expect(res.status).toBe(200);
        expect(res.body.totalDistance).toBe(300);
    });
});



// ----------------------------------------------
// POST /api/v1/users/saved-trips/:id
// ----------------------------------------------
describe("POST /api/v1/users/saved-trips/:id", () => {
    test("should save trip", async () => {
        Trip.findById.mockResolvedValueOnce({ _id: "trip123" });

        User.findByIdAndUpdate.mockResolvedValueOnce({});

        const res = await request(app)
            .post("/api/v1/users/saved-trips/123");

        expect(res.status).toBe(200);
    });
});



// ----------------------------------------------
// DELETE /api/v1/users/saved-trips/:id
// ----------------------------------------------
describe("DELETE /api/v1/users/saved-trips/:id", () => {
    test("should remove saved trip", async () => {
        User.findById.mockResolvedValueOnce({
            savedTrips: ["123"]
        });

        User.findByIdAndUpdate.mockResolvedValueOnce({});

        const res = await request(app)
            .delete("/api/v1/users/saved-trips/123");

        expect(res.status).toBe(200);
    });
});
