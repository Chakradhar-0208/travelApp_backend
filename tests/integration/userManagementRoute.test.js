import request from "supertest";
import { describe, test, expect, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import app from "../../index.js";
import User from "../../models/User.js";
import Trip from "../../models/Trip.js";
import { setCache, getCache, invalidateUserCache } from "../../utils/caching/userCache.js";
import cloudinary from "../../config/cloudinary.js";
import multer from "../../middlewares/multer.js";
import Journey from "../../models/Journey.js";

let fakeCache = {};
let mockUserId = new mongoose.Types.ObjectId().toString();
let mockUser = {
    userId: mockUserId,
    role: "user",
    email: "logged@user.com"
};

async function createValidTrip(overrides = {}) {
    return Trip.create({
        title: "Valid Trip",
        description: "desc",
        startPoint: {
            name: "A",
            location: { type: "Point", coordinates: [80, 17] }
        },
        endPoint: {
            name: "B",
            location: { type: "Point", coordinates: [81, 18] }
        },
        distance: 10,
        duration: 1,
        estimatedCost: {
            car: { fuel: 10, tolls: 5 },
            bike: { fuel: 5, tolls: 2 }
        },
        ...overrides
    });
}

// mock auth middleware
vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = mockUser;
        next();
    },
}));

// mock caching
vi.mock("../../utils/caching/userCache.js", () => ({
    getCache: (key) => fakeCache[key],
    setCache: (key, val) => (fakeCache[key] = val),
    invalidateUserCache: vi.fn(),
}));

vi.mock("../../middlewares/multer.js", () => ({
    __esModule: true,
    default: {
        single: () => (req, res, next) => {
            req.body = req.body || {};
            req.file = { buffer: Buffer.from("mock") };
            next();
        },
        array: () => (req, res, next) => {
            req.body = req.body || {};
            req.files = [{ buffer: Buffer.from("mock") }];
            next();
        }
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

vi.mock("streamifier", () => ({
    default: {
        createReadStream: vi.fn(() => ({
            pipe: vi.fn()
        }))
    }
}));

beforeEach(() => {
    vi.clearAllMocks();
})

describe("GET /api/v1/users/getUser", () => {

    test("returns 400 if email is missing", async () => {
        const res = await request(app).get(`/api/v1/users/getUser`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Email required.");
    });

    test("returns 403 if logged-in user is not the target & not admin", async () => {
        const res = await request(app)
            .get(`/api/v1/users/getUser?email=abc@test.com`);

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Access denied. Unauthorized user.");
    });

    test("returns 404 if user not found", async () => {
        mockUser.email = "test@test.com";

        const res = await request(app)
            .get(`/api/v1/users/getUser?email=test@test.com`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("User not found.");
    });

    test("returns user from DB on cache MISS (non-detailed)", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "logged@user.com",
            password: "VERSTAPPEN",
            age: 21,
            gender: "male",
            role: "user",
            tripCount: 5,
            totalDistance: 120,
            totalJourneyTime: 10,
        });

        mockUser.email = "logged@user.com";

        const res = await request(app)
            .get(`/api/v1/users/getUser?email=${user.email}&detailed=false`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
        expect(res.body.user.name).toBe("Kiran");

        const cacheKey = `user:${JSON.stringify(user.email)},detailed:false`;
        expect(fakeCache[cacheKey]).toBeDefined();
    });

    test("returns cached user on cache HIT", async () => {

        const cacheKey = `user:${JSON.stringify("logged@user.com")},detailed:false`;

        fakeCache[cacheKey] = {
            user: { name: "Cached User", email: "logged@user.com" }
        };

        mockUser.email = "logged@user.com";

        const res = await request(app)
            .get(`/api/v1/users/getUser?email=logged@user.com&detailed=false`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.user.name).toBe("Cached User");
    });

    test("returns detailed user info when detailed=true", async () => {

        const trip1 = await Trip.create({
            title: "Long Trip",
            distance: 200,
            duration: 5,
            startPoint: { name: "A", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "B", location: { type: "Point", coordinates: [81, 18] } },
            estimatedCost: { car: { fuel: 10, tolls: 5 }, bike: { fuel: 5, tolls: 2 } }
        });

        const trip2 = await Trip.create({
            title: "Time Beast",
            distance: 50,
            duration: 10,
            startPoint: { name: "X", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "Y", location: { type: "Point", coordinates: [81, 18] } },
            estimatedCost: { car: { fuel: 10, tolls: 5 }, bike: { fuel: 5, tolls: 2 } }
        });

        const user = await User.create({
            name: "Kiran",
            email: "logged@user.com",
            password: "VERSTAPPEN",
            role: "user",
            longestTrip: {
                byDistance: trip1._id,
                byDuration: trip2._id
            }
        });

        mockUser.email = "logged@user.com";

        const res = await request(app)
            .get(`/api/v1/users/getUser?email=${user.email}&detailed=true`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");

        expect(res.body.user.longestTrip.byDistance.title).toBe("Long Trip");
        expect(res.body.user.longestTrip.byDuration.title).toBe("Time Beast");
    });

    test("allows admin to fetch any user", async () => {
        const user = await User.create({
            name: "Random",
            email: "random@test.com",
            password: "VERSTAPPEN",
            role: "user"
        });

        mockUser.role = "admin";
        mockUser.email = "admin@test.com";

        const res = await request(app)
            .get(`/api/v1/users/getUser?email=${user.email}&detailed=false`);

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe("random@test.com");
    });

});

describe("GET /api/v1/user/savedTrips", () => {

    test("returns 404 if user not found", async () => {
        // mock userId but we don't create that user
        const res = await request(app).get("/api/v1/users/savedTrips");

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("User not found.");
    });

    test("returns empty array if user has no saved trips", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            savedTrips: []
        });

        const res = await request(app).get("/api/v1/users/savedTrips");

        expect(res.status).toBe(200);
        expect(res.body.savedTrips).toEqual([]);
    });

    test("returns populated saved trips", async () => {
        const trip1 = await Trip.create({
            title: "Trip A",
            description: "Nice",
            startPoint: { name: "A", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "B", location: { type: "Point", coordinates: [81, 18] } },
            distance: 20,
            duration: 2,
            estimatedCost: {
                car: { fuel: 10, tolls: 5 },
                bike: { fuel: 5, tolls: 3 }
            },
            imageURLs: ["imgA.jpg"]
        });

        const trip2 = await Trip.create({
            title: "Trip B",
            description: "Cool",
            startPoint: { name: "X", location: { type: "Point", coordinates: [75, 13] } },
            endPoint: { name: "Y", location: { type: "Point", coordinates: [82, 19] } },
            distance: 50,
            duration: 5,
            estimatedCost: {
                car: { fuel: 20, tolls: 10 },
                bike: { fuel: 10, tolls: 5 }
            },
            imageURLs: ["imgB.jpg"]
        });

        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            savedTrips: [trip1._id, trip2._id]
        });

        const res = await request(app).get("/api/v1/users/savedTrips");

        expect(res.status).toBe(200);
        expect(res.body.savedTrips.length).toBe(2);

        // make sure trips are populated
        expect(res.body.savedTrips[0].title).toBe("Trip A");
        expect(res.body.savedTrips[1].title).toBe("Trip B");
        expect(res.body.savedTrips[0].imageURLs).toContain("imgA.jpg");
    });

});

describe("PUT /api/v1/users/updateUser/:id", () => {

    test("returns 403 if user tries to update another user's account", async () => {
        mockUser.role = "user";
        mockUser.userId = new mongoose.Types.ObjectId();
        const targetUserId = new mongoose.Types.ObjectId(); // different

        const res = await request(app)
            .put(`/api/v1/users/updateUser/${targetUserId}`)
            .send({ name: "Hacker" });
        console.log(res.body)
        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Access denied. You can only update your own account.");
    });

    test("allows admin to update any user's data", async () => {
        // Make auth middleware return admin
        mockUser.role = "admin"

        const user = await User.create({
            name: "Old Name",
            email: "a@b.com",
            password: "pass"
        });

        const res = await request(app)
            .put(`/api/v1/users/updateUser/${user._id}`)
            .send({ name: "New Name" });

        expect(res.status).toBe(200);
        expect(res.body.user.name).toBe("New Name");
    });

    test("returns 400 when no valid update fields are provided", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass"
        });

        const res = await request(app)
            .put(`/api/v1/users/updateUser/${user._id}`)
            .send({ invalidField: "useless" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("No valid fields provided.");
    });

    test("returns 404 when trying to update non-existing user", async () => {
        const fakeId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/users/updateUser/${fakeId}`)
            .send({ name: "Test" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("User not found.");
    });

    test("updates only allowed fields and ignores others", async () => {
        const user = await User.create({
            name: "Max",
            email: "max@rb.com",
            password: "pass"
        });

        const res = await request(app)
            .put(`/api/v1/users/updateUser/${user._id}`)
            .send({
                name: "Verstappen",
                hackerField: "should_not_exist",
                age: 21
            });

        expect(res.status).toBe(200);
        expect(res.body.user.name).toBe("Verstappen");
        expect(res.body.user.age).toBe(21);
        expect(res.body.user.hackerField).toBeUndefined();
    });

    test("invalidates user cache after update", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass"
        });

        const res = await request(app)
            .put(`/api/v1/users/updateUser/${user._id}`)
            .send({ name: "New Kiran" });

        expect(res.status).toBe(200);
        expect(invalidateUserCache).toHaveBeenCalled();
    });

});

describe("GET /api/v1/users/getProfileImage", () => {

    test("returns 400 if email is missing", async () => {
        const res = await request(app)
            .get("/api/v1/users/getProfileImage"); // no query
        console.log(res.body)
        expect(res.status).toBe(404);
        expect(res.body.message).toBeDefined();
    });

    test("returns 404 if user does not exist", async () => {
        const res = await request(app)
            .get("/api/v1/users/getProfileImage?email=ghost@void.com");

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Profile Image not found");
    });

    test("returns 404 if user exists but has no profile image", async () => {
        await User.create({
            name: "Test",
            email: "noimg@test.com",
            password: "pass"
            // no profileImage field
        });

        const res = await request(app)
            .get("/api/v1/users/getProfileImage?email=noimg@test.com");

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Profile Image not found");
    });

    test("returns profile image from DB on cache MISS and sets cache", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            profileImage: "kiran_pic"
        });

        const res = await request(app)
            .get("/api/v1/users/getProfileImage?email=k@v.com");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");

        // cloudinary URL mock
        expect(res.body.profileImage)
            .toBe("mock_transformed_url");

        // cache should be set
        const key = `profileImage:${JSON.stringify({ email: "k@v.com" })}`;
        expect(fakeCache[key]).toBeDefined();
        expect(fakeCache[key].profileImage)
            .toBe("mock_transformed_url");
    });

    test("returns cached data when cache HIT occurs", async () => {
        const key = `profileImage:${JSON.stringify({ email: "cache@test.com" })}`;

        fakeCache[key] = {
            profileImage: "https://cloud.fake/cached",
        };

        const res = await request(app)
            .get("/api/v1/users/getProfileImage?email=cache@test.com");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.profileImage).toBe("https://cloud.fake/cached");
    });

});

// describe("PUT /api/v1/users/updateProfileImage", () => {

//     test("returns 403 if user is not authorized", async () => {
//         const user = await User.create({
//             name: "Random Dude",
//             email: "other@test.com",
//             password: "pass",
//         });

//         const res = await request(app)
//             .put("/api/v1/users/updateProfileImage")
//             .field("email", "other@test.com")
//             .attach("profileImage", Buffer.from("fake"), "fake.jpg");
//         console.log(res.error)
//         expect(res.status).toBe(403);
//         expect(res.body.message).toBe("Access denied. Unauthorized user.");
//     });

//     test("returns 404 if user is not found", async () => {
//         const res = await request(app)
//             .put("/api/v1/users/updateProfileImage")
//             .field("email", "ghost@test.com")
//             .attach("profileImage", Buffer.from("fake"), "fake.jpg");

//         expect(res.status).toBe(404);
//         expect(res.body.message).toBe("User not found!");
//     });

//     test("queues background upload and returns 202", async () => {
//         const user = await User.create({
//             name: "Kiran Kumar",
//             email: "me@test.com",
//             password: "pass",
//         });

//         const res = await request(app)
//             .put("/api/v1/users/updateProfileImage")
//             .field("email", "me@test.com")
//             .attach("profileImage", Buffer.from("fake-image"), "test.png");

//         expect(res.status).toBe(202);
//         expect(res.body.message)
//             .toBe("Profile image update queued successfully (background job)");

//         // Background run
//         await new Promise(resolve => setImmediate(resolve));

//         expect(streamifier.default.createReadStream).toHaveBeenCalled();

//         expect(cloudinary.uploader.upload_stream).toHaveBeenCalled();
//     });

//     test("cloudinary upload callback updates user profile image", async () => {
//         const user = await User.create({
//             name: "Max Verstappen",
//             email: "me@test.com",
//             password: "pass",
//         });

//         const mockCb = vi.fn();
//         cloudinary.uploader.upload_stream.mockImplementation((opts, cb) => {
//             mockCb.mockImplementation(() =>
//                 cb(null, { public_id: "new_public_id" })
//             );
//             return { end: () => { } };
//         });

//         const res = await request(app)
//             .put("/api/v1/users/updateProfileImage")
//             .field("email", "me@test.com")
//             .attach("profileImage", Buffer.from("fake-image"), "test.png");

//         expect(res.status).toBe(202);

//         await new Promise(resolve => setImmediate(resolve));

//         expect(mockCb).toHaveBeenCalled();

//         const updatedUser = await User.findOne({ email: "me@test.com" });

//         expect(updatedUser.profileImage).toBe("new_public_id");

//         expect(invalidateUserCache).toHaveBeenCalled();
//     });

// });

describe("POST /api/v1/users/createUser", () => {

    test("returns 400 if required fields are missing", async () => {
        const res = await request(app)
            .post("/api/v1/users/createUser")
            .send({ name: "Kiran", email: "" }); // missing password

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Fill all required fields.");
    });

    test("creates user successfully and sets default role=user", async () => {
        const res = await request(app)
            .post("/api/v1/users/createUser")
            .send({
                name: "Kiran",
                email: "kiran@test.com",
                password: "pass123"
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("User created successfully");

        // returned user fields
        expect(res.body.user).toHaveProperty("_id");
        expect(res.body.user.name).toBe("Kiran");
        expect(res.body.user.email).toBe("kiran@test.com");
        expect(res.body.user.role).toBe("user");

        // verify DB state
        const userInDb = await User.findOne({ email: "kiran@test.com" }).lean();
        expect(userInDb).not.toBeNull();
        expect(userInDb.role).toBe("user");
    });

    test("invalidates user cache on user creation", async () => {
        await request(app)
            .post("/api/v1/users/createUser")
            .send({
                name: "Kiran",
                email: "cache@test.com",
                password: "pass123"
            });

        expect(invalidateUserCache).toHaveBeenCalled();
    });

    test("returns error when Mongo validation fails", async () => {
        // Simulate mongoose throwing an error — e.g., duplicate email
        await User.create({
            name: "Old",
            email: "exist@test.com",
            password: "pass"
        });

        const res = await request(app)
            .post("/api/v1/users/createUser")
            .send({
                name: "New",
                email: "exist@test.com", // duplicate
                password: "pass"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

});

describe("DELETE /api/v1/users/deleteUser", () => {

    test("returns 403 if user is not authorized", async () => {
        // logged-in user
        mockUser.email = "logged@test.com";
        mockUser.role = "user";

        // trying to delete another user
        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "someoneelse@test.com" });

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Access denied. Unauthorized user.");
    });

    test("returns 404 if user does not exist", async () => {
        mockUser.email = "ghost@test.com";

        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "ghost@test.com" });

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("User not found");
    });

    test("allows admin to delete any user", async () => {
        mockUser.role = "admin";

        const user = await User.create({
            name: "Random Guy",
            email: "victim@test.com",
            password: "pass"
        });

        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "victim@test.com" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");

        const exists = await User.findOne({ email: "victim@test.com" });
        expect(exists).toBeNull();
    });

    test("logged-in user can delete their own account", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "kiran@test.com",
            password: "pass"
        });

        mockUser.email = "kiran@test.com";
        mockUser.role = "user";

        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "kiran@test.com" });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");

        const exists = await User.findOne({ email: "kiran@test.com" });
        expect(exists).toBeNull();
    });

    test("invalidates user cache after deletion", async () => {
        const user = await User.create({
            name: "To Delete",
            email: "del@test.com",
            password: "pass"
        });

        mockUser.email = "del@test.com";

        const res = await request(app)
            .delete("/api/v1/users/deleteUser")
            .send({ email: "del@test.com" });

        expect(res.status).toBe(200);
        expect(invalidateUserCache).toHaveBeenCalled();
    });

});

describe("GET /api/v1/users/analytics", () => {

    test("returns correct analytics for a user", async () => {
        const userId = mockUser.userId;

        // Create journeys
        await Journey.create([
            {
                userId,
                tripId: new mongoose.Types.ObjectId(),
                totalDistance: 100,
                totalDuration: 5
            },
            {
                userId,
                tripId: new mongoose.Types.ObjectId(),
                totalDistance: 250,
                totalDuration: 10
            },
            {
                userId,
                tripId: new mongoose.Types.ObjectId(),
                totalDistance: 50,
                totalDuration: 3
            }
        ]);

        const res = await request(app)
            .get("/api/v1/users/analytics");

        expect(res.status).toBe(200);

        expect(res.body.tripCount).toBe(3);
        expect(res.body.totalDistance).toBe(100 + 250 + 50);
        expect(res.body.totalJourneyTime).toBe(5 + 10 + 3);

        expect(res.body.longestTrip.distance).toBe(250);
        expect(res.body.longestTrip.duration).toBe(10);
    });

    test("returns tripCount = 0 and null longestTrip when user has no journeys", async () => {
        // Ensure user has no journeys
        await Journey.deleteMany({ userId: mockUser.userId });

        const res = await request(app)
            .get("/api/v1/users/analytics");

        expect(res.status).toBe(200);
        expect(res.body.tripCount).toBe(0);
        expect(res.body.totalDistance).toBe(0);
        expect(res.body.totalJourneyTime).toBe(0);
        expect(res.body.longestTrip).toBeNull();
    });

    test("returns 500 if an internal error occurs", async () => {
        // Force Journey.find to throw
        const originalFind = Journey.find;
        Journey.find = () => { throw new Error("Mock failure") };

        const res = await request(app)
            .get("/api/v1/users/analytics");

        Journey.find = originalFind; // restore

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Internal Server Error");
    });

});

describe("GET /api/v1/users/saved-trips", () => {

    test("returns empty array when user does not exist", async () => {
        // mockUser.userId exists but NOT in DB
        const res = await request(app)
            .get("/api/v1/users/saved-trips");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("returns empty array when user exists but savedTrips is empty", async () => {
        await User.create({
            _id: mockUser.userId,   // important
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            savedTrips: []
        });

        const res = await request(app)
            .get("/api/v1/users/saved-trips");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test("returns populated saved trips", async () => {

        const trip1 = await createValidTrip({ title: "Trip A" });
        const trip2 = await createValidTrip({ title: "Trip B" });


        await User.create({
            _id: mockUser.userId,
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            savedTrips: [trip1._id, trip2._id]
        });

        const res = await request(app)
            .get("/api/v1/users/saved-trips");

        expect(res.status).toBe(200);

        expect(res.body.length).toBe(2);
        expect(res.body[0].title).toBe("Trip A");
        expect(res.body[1].title).toBe("Trip B");
    });

    test("returns 500 on internal error", async () => {
        const original = User.findById;

        User.findById = () => { throw new Error("Mock DB crash") };

        const res = await request(app)
            .get("/api/v1/users/saved-trips");

        User.findById = original;

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Internal Server Error");
    });

});

describe("POST /api/v1/users/saved-trips/:tripId", () => {

    test("returns 400 for invalid tripId format", async () => {
        const res = await request(app)
            .post("/api/v1/users/saved-trips/12345"); // NOT a valid ObjectId

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid Trip Id");
    });

    test("returns 404 if trip does not exist", async () => {
        const fakeTripId = new mongoose.Types.ObjectId();

        const user = await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass"
        });

        const res = await request(app)
            .post(`/api/v1/users/saved-trips/${fakeTripId}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Trip not found");
    });

    test("returns 200 and saves trip successfully", async () => {

        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass",
            savedTrips: []
        });
        mockUser.userId = mockUserId;
        const trip = await createValidTrip();

        const res = await request(app)
            .post(`/api/v1/users/saved-trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("success");

        const updatedUser = await User.findById(mockUserId).lean();
        console.log(updatedUser)
        expect(updatedUser.savedTrips.length).toBe(1);
        expect(updatedUser.savedTrips[0].toString()).toBe(trip._id.toString());
    });

    test("does NOT duplicate trip because of $addToSet", async () => {

        const trip = await createValidTrip();

        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass",
            savedTrips: [trip._id]
        });

        const res = await request(app)
            .post(`/api/v1/users/saved-trips/${trip._id}`);

        expect(res.status).toBe(200);

        const updatedUser = await User.findById(mockUserId).lean();
        expect(updatedUser.savedTrips.length).toBe(1); // no duplicate
    });
});

describe("DELETE /api/v1/users/saved-trips/:tripId", () => {

    test("returns 400 for invalid tripId", async () => {
        const res = await request(app)
            .delete("/api/v1/users/saved-trips/12345");

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid Trip Id");
    });

    test("returns 400 if trip is NOT in savedTrips", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass",
            savedTrips: []     // empty
        });

        const trip = await createValidTrip();

        const res = await request(app)
            .delete(`/api/v1/users/saved-trips/${trip._id}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("This trip is not in saved list");
    });

    test("returns 200 and removes the saved trip", async () => {
        const trip = await createValidTrip();

        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@test.com",
            password: "pass",
            savedTrips: [trip._id]     // trip already saved
        });

        const res = await request(app)
            .delete(`/api/v1/users/saved-trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("success");

        const updatedUser = await User.findById(mockUserId).lean();
        expect(updatedUser.savedTrips.length).toBe(0);
    });

    test("returns 500 if user does not exist (your route throws)", async () => {
        // mockUserId exists in middleware but NOT in DB

        const trip = await createValidTrip();

        const res = await request(app)
            .delete(`/api/v1/users/saved-trips/${trip._id}`);

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Internal Server Error");
    });

});

