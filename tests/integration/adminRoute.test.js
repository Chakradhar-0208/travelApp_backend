import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { getCache, setCache } from "../../utils/caching/adminCaching";
import app from "../..";
import User from "../../models/User";
import mongoose from "mongoose";
import { invalidateAdminCache } from "../../utils/caching/adminCaching";
import Trip from "../../models/Trip";
import cloudinary from "../../config/cloudinary";
import Report from "../../models/Report";

vi.mock("../../config/cloudinary.js", () => ({
    default: {
        api: {
            delete_resources_by_prefix: vi.fn().mockResolvedValue({})
        }
    }
}));

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { id: "fake", role: "admin" };
        next();
    },
}));

vi.mock("../../middleware/requireRole.js", () => ({
    default: () => (req, res, next) => next(),
}));

let fakeCache = {};

vi.mock("../../utils/caching/adminCaching", () => ({
    getCache: (key) => fakeCache[key],
    setCache: (key, val) => (fakeCache[key] = val),
    invalidateAdminCache: vi.fn()
}));


afterEach(async () => {
    // Get all collections in the current DB
    const collections = Object.keys(mongoose.connection.collections);

    for (const name of collections) {
        await mongoose.connection.collections[name].deleteMany({});
    }

    for (const key in fakeCache) {
        delete fakeCache[key];
    }
});

describe("GET /api/v1/admin/users", () => {

    test("returns users from DB on cache miss", async () => {
        await User.create([
            { name: "Kiran", email: "k@v.com", password: "pass", role: "user", profileImage: "hehe" },
            { name: "Max", email: "max@rb.com", role: "admin", password: "PASS", profileImage: "rb" },
        ]);

        const res = await request(app).get("/api/v1/admin/users");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
        expect(res.body.users.length).toBe(2);

        // Confirm cache was set
        expect(fakeCache["admin_users_list"]).toBeDefined();
        expect(fakeCache["admin_users_list"].length).toBe(2);
    });

    test("returns cached users when cache exists", async () => {
        fakeCache["admin_users_list"] = [
            { name: "Cached User", email: "cached@test.com" },
        ];

        const res = await request(app).get("/api/v1/admin/users");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.users[0].name).toBe("Cached User");
    });

});

describe("GET /api/v1/admin/users/:id", () => {
    test("returns user from DB on cache miss", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            role: "user",
            profileImage: "hehe"
        });

        const res = await request(app)
            .get(`/api/v1/admin/users/${user._id}`)
            .set("Authorization", "Bearer VALID_ADMIN_TOKEN");

        expect(res.status).toBe(200);
        expect(res.body.user.name).toBe("Kiran");
        expect(res.body.source).toBeUndefined(); // route doesn't add "db"

        expect(fakeCache[`admin_user:${user._id}`]).toBeDefined();
        expect(fakeCache[`admin_user:${user._id}`].email).toBe("k@v.com");
    });
    test("returns cached user when cache exists", async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();

        fakeCache[`admin_user:${fakeId}`] = {
            name: "Cached Kiran",
            email: "c@test.com",
        };

        const res = await request(app)
            .get(`/api/v1/admin/users/${fakeId}`)
            .set("Authorization", "Bearer VALID_ADMIN_TOKEN");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.user.name).toBe("Cached Kiran");
    });
    test("returns 400 for invalid user ID format", async () => {
        const res = await request(app)
            .get("/api/v1/admin/users/INVALID_ID")
            .set("Authorization", "Bearer VALID_ADMIN_TOKEN");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid User ID format");
    });
    test("returns 404 if user not found", async () => {
        const randomId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .get(`/api/v1/admin/users/${randomId}`)
            .set("Authorization", "Bearer VALID_ADMIN_TOKEN");

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("User not found");
    });
});

describe("PUT /api/v1/admin/users/:id", () => {
    test("returns 400 for invalid ObjectId", async () => {
        const res = await request(app)
            .put("/api/v1/admin/users/INVALID_ID")
            .send({ name: "New Name" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid User ID format");
    });
    test("returns 404 when user does not exist", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/admin/users/${id}`)
            .send({ name: "New Name" });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("User not found");
    });
    test("updates the user when valid fields are provided", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "old@mail.com",
            password: "pass",
            role: "user"
        });

        const res = await request(app)
            .put(`/api/v1/admin/users/${user._id}`)
            .send({
                name: "New Kiran",
                email: "new@mail.com",
                role: "admin",
                tripCount: 10,
            });
        console.log(res.error)
        expect(res.status).toBe(200);
        expect(res.body.user.name).toBe("New Kiran");
        expect(res.body.user.email).toBe("new@mail.com");
        expect(res.body.user.role).toBe("admin");
        expect(res.body.user.tripCount).toBe(10);
    });
    test("ignores fields not in allowedFields", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@mail.com",
            password: "pass",
            role: "user"
        });

        const res = await request(app)
            .put(`/api/v1/admin/users/${user._id}`)
            .send({
                hackerField: "lol",
                anotherBadField: 999,
            });

        expect(res.status).toBe(200);
        expect(res.body.user.hackerField).toBeUndefined();
        expect(res.body.user.anotherBadField).toBeUndefined();
    });

});

describe("DELETE /api/v1/admin/users/:id", () => {
    test("returns 400 for invalid user ID format", async () => {
        const res = await request(app)
            .delete("/api/v1/admin/users/WRONG_ID");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid User ID format");
    });
    test("returns 404 when user does not exist", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/admin/users/${id}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("User not found");
    });
    test("deletes user successfully", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "test@example.com",
            password: "pass",
            role: "user"
        });

        const res = await request(app)
            .delete(`/api/v1/admin/users/${user._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");

        const deleted = await User.findById(user._id);
        expect(deleted).toBeNull();
    });

});

describe("GET /api/v1/admin/trips", () => {

    test("returns cached trips when cache exists", async () => {
        const fakeTripData = [
            { title: "Cached Trek", estimatedCost: 5000 }
        ];

        fakeCache["admin_trips_list"] = fakeTripData;

        const res = await request(app)
            .get("/api/v1/admin/trips");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.trips).toEqual(fakeTripData);
    });

    test("returns trips from DB on cache miss and sets cache", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "kiran@treks.com",
            password: "pass"
        });
        fakeCache["admin_trips_list"] = null;

        await Trip.create([
            {
                title: "Himalaya Adventure",
                description: "A thrilling trek",
                estimatedCost: {
                    bike: {
                        fuel: 100,
                        tolls: 50
                    },
                    car: {
                        fuel: 200,
                        tolls: 100
                    }
                },
                distance: 45,
                duration: 3, // Number, not string
                rating: 4.8,
                reviewCount: 26,
                difficulty: "moderate", // match enum exactly
                imageURLs: ["img1.jpg"],
                altitudeSickness: false,
                status: "active",

                startPoint: {
                    name: "Start",
                    location: { type: "Point", coordinates: [80.1, 17.2] }
                },
                endPoint: {
                    name: "End",
                    location: { type: "Point", coordinates: [81.2, 18.1] }
                },

                createdBy: user._id
            }
        ]);

        const res = await request(app)
            .get("/api/v1/admin/trips");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
        expect(res.body.trips.length).toBe(1);
        expect(res.body.trips[0].title).toBe("Himalaya Adventure");

        // Check cache was set
        expect(fakeCache["admin_trips_list"]).toBeDefined();
        expect(fakeCache["admin_trips_list"].length).toBe(1);
    });

    test("only returns trips with status active", async () => {
        const user = await User.create({
            name: "Max",
            email: "max@rb.com",
            password: "pass"
        });

        await Trip.create([
            {
                title: "Active Trip",
                description: "A thrilling trek",
                estimatedCost: {
                    bike: {
                        fuel: 100,
                        tolls: 50
                    },
                    car: {
                        fuel: 200,
                        tolls: 100
                    }
                },
                distance: 45,
                duration: 3, // Number, not string
                rating: 4.8,
                reviewCount: 26,
                difficulty: "moderate", // match enum exactly
                imageURLs: ["img1.jpg"],
                altitudeSickness: false,
                status: "active",

                startPoint: {
                    name: "Start",
                    location: { type: "Point", coordinates: [80.1, 17.2] }
                },
                endPoint: {
                    name: "End",
                    location: { type: "Point", coordinates: [81.2, 18.1] }
                },

                createdBy: user._id
            }
        ]);

        const res = await request(app)
            .get("/api/v1/admin/trips");

        expect(res.status).toBe(200);
        expect(res.body.trips.length).toBe(1);
        expect(res.body.trips[0].title).toBe("Active Trip");
    });

    test("populates createdBy with name and email", async () => {
        const user = await User.create({
            name: "Creator",
            email: "creator@test.com",
            password: "pass"
        });

        await Trip.create([
            {
                title: "Himalaya Adventure",
                description: "A thrilling trek",
                estimatedCost: {
                    bike: {
                        fuel: 100,
                        tolls: 50
                    },
                    car: {
                        fuel: 200,
                        tolls: 100
                    }
                },
                distance: 45,
                duration: 3, // Number, not string
                rating: 4.8,
                reviewCount: 26,
                difficulty: "moderate", // match enum exactly
                imageURLs: ["img1.jpg"],
                altitudeSickness: false,
                status: "active",

                startPoint: {
                    name: "Start",
                    location: { type: "Point", coordinates: [80.1, 17.2] }
                },
                endPoint: {
                    name: "End",
                    location: { type: "Point", coordinates: [81.2, 18.1] }
                },

                createdBy: user._id
            }
        ]);

        const res = await request(app)
            .get("/api/v1/admin/trips");

        expect(res.status).toBe(200);

        const trip = res.body.trips[0];

        expect(trip.createdBy.name).toBe("Creator");
        expect(trip.createdBy.email).toBe("creator@test.com");
    });

});

describe("GET /api/v1/admin/trips/:id", () => {

    test("returns cached inactive trips when cache exists", async () => {
        const fakeData = [
            { title: "Cached Inactive Trip", distance: 10 }
        ];

        fakeCache["admin_inactive_trips_list"] = fakeData;

        const res = await request(app)
            .get("/api/v1/admin/trips/inactive");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.trips).toEqual(fakeData);
    });

    test("returns inactive trips from DB on cache miss and sets cache", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "kiran@treks.com",
            password: "pass"
        });

        await Trip.create({
            title: "Pending Trek",
            description: "Not approved yet",
            estimatedCost: {
                bike: { fuel: 100, tolls: 50 },
                car: { fuel: 200, tolls: 100 }
            },
            distance: 30,
            duration: 2,
            rating: 4.2,
            reviewCount: 12,
            difficulty: "moderate",
            imageURLs: ["photo.jpg"],
            altitudeSickness: false,
            status: "inactive",
            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [80.0, 17.1] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [81.0, 18.0] }
            },
            createdBy: user._id
        });

        const res = await request(app)
            .get("/api/v1/admin/trips/inactive");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
        expect(res.body.trips.length).toBe(1);
        expect(res.body.trips[0].title).toBe("Pending Trek");

        // cache stored
        expect(fakeCache["admin_inactive_trips_list"]).toBeDefined();
        expect(fakeCache["admin_inactive_trips_list"].length).toBe(1);
    });

    test("only returns trips with status inactive", async () => {
        const user = await User.create({
            name: "Max",
            email: "max@rb.com",
            password: "pass"
        });

        await Trip.create([
            {
                title: "Inactive Trip",
                status: "inactive",
                estimatedCost: { bike: { fuel: 10, tolls: 5 }, car: { fuel: 20, tolls: 10 } },
                distance: 10,
                duration: 1,
                difficulty: "easy",
                imageURLs: ["1.jpg"],
                altitudeSickness: false,
                startPoint: { name: "A", location: { type: "Point", coordinates: [10, 20] } },
                endPoint: { name: "B", location: { type: "Point", coordinates: [20, 30] } },
                createdBy: user._id
            },
            {
                title: "Active Trip Should Not Show",
                status: "active",
                estimatedCost: { bike: { fuel: 10, tolls: 5 }, car: { fuel: 20, tolls: 10 } },
                distance: 12,
                duration: 2,
                difficulty: "easy",
                imageURLs: ["2.jpg"],
                altitudeSickness: false,
                startPoint: { name: "A", location: { type: "Point", coordinates: [10, 20] } },
                endPoint: { name: "B", location: { type: "Point", coordinates: [20, 30] } },
                createdBy: user._id
            }
        ]);

        const res = await request(app)
            .get("/api/v1/admin/trips/inactive");

        expect(res.status).toBe(200);
        expect(res.body.trips.length).toBe(1);
        expect(res.body.trips[0].title).toBe("Inactive Trip");
    });

    test("populates createdBy with name & email for inactive trips", async () => {
        const creator = await User.create({
            name: "Creator Person",
            email: "creator@test.com",
            password: "pass"
        });

        await Trip.create({
            title: "Unapproved Trip",
            status: "inactive",
            estimatedCost: { bike: { fuel: 10, tolls: 5 }, car: { fuel: 20, tolls: 10 } },
            distance: 14,
            duration: 2,
            difficulty: "moderate",
            imageURLs: ["x.jpg"],
            altitudeSickness: false,
            startPoint: { name: "S", location: { type: "Point", coordinates: [1, 2] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [3, 4] } },
            createdBy: creator._id
        });

        const res = await request(app)
            .get("/api/v1/admin/trips/inactive");

        expect(res.status).toBe(200);

        const trip = res.body.trips[0];

        expect(trip.createdBy.name).toBe("Creator Person");
        expect(trip.createdBy.email).toBe("creator@test.com");
    });
});

describe("GET /api/v1/admin/trips/:id", () => {

    test("returns 400 for invalid trip ID format", async () => {
        const res = await request(app)
            .get("/api/v1/admin/trips/NOT_A_VALID_ID");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid Trip ID format");
    });

    test("returns 404 when trip does not exist", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .get(`/api/v1/admin/trips/${id}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

    test("returns cached trip when cache exists", async () => {
        const id = new mongoose.Types.ObjectId().toString();

        fakeCache[`admin_trip:${id}`] = {
            title: "Cached Trip",
            rating: 4.9
        };

        const res = await request(app)
            .get(`/api/v1/admin/trips/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.trip.title).toBe("Cached Trip");
    });

    test("returns trip from DB on cache miss and sets cache", async () => {
        const creator = await User.create({
            name: "Kiran Creator",
            email: "creator@test.com",
            password: "pass"
        });

        // Create a valid trip
        const trip = await Trip.create({
            title: "Mountain Escape",
            description: "A cold adventure",
            estimatedCost: {
                bike: { fuel: 50, tolls: 10 },
                car: { fuel: 100, tolls: 20 }
            },
            distance: 20,
            duration: 2,
            rating: 4.5,
            reviewCount: 10,
            difficulty: "moderate",
            imageURLs: ["pic.jpg"],
            altitudeSickness: false,
            status: "active",

            startPoint: {
                name: "Base",
                location: { type: "Point", coordinates: [80, 17] }
            },
            endPoint: {
                name: "Peak",
                location: { type: "Point", coordinates: [81, 18] }
            },

            createdBy: creator._id
        });

        const res = await request(app)
            .get(`/api/v1/admin/trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBeUndefined(); // route doesn't send "db"
        expect(res.body.trip.title).toBe("Mountain Escape");

        // check populate
        expect(res.body.trip.createdBy.name).toBe("Kiran Creator");
        expect(res.body.trip.createdBy.email).toBe("creator@test.com");

        // cache check
        const cacheKey = `admin_trip:${trip._id}`;
        expect(fakeCache[cacheKey]).toBeDefined();
        expect(fakeCache[cacheKey].title).toBe("Mountain Escape");
    });

});

describe("PUT /api/v1/admin/trips/:id", () => {

    test("returns 400 for invalid Trip ID format", async () => {
        const res = await request(app)
            .put("/api/v1/admin/trips/NOT_VALID")
            .send({ title: "New Title" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid Trip ID format");
    });

    test("returns 404 when trip does not exist", async () => {
        const id = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .put(`/api/v1/admin/trips/${id}`)
            .send({ title: "Updated Title" });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

    test("updates the trip when valid fields are provided", async () => {
        const creator = await User.create({
            name: "Kiran",
            email: "kiran@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Old Title",
            description: "Old Desc",
            estimatedCost: {
                bike: { fuel: 50, tolls: 10 },
                car: { fuel: 100, tolls: 20 }
            },
            distance: 10,
            duration: 1,
            rating: 4.3,
            reviewCount: 5,
            difficulty: "easy",
            imageURLs: ["old.jpg"],
            altitudeSickness: false,
            status: "active",

            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [80.1, 17.2] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [81.1, 18.1] }
            },

            createdBy: creator._id
        });

        const res = await request(app)
            .put(`/api/v1/admin/trips/${trip._id}`)
            .send({
                title: "Updated Title",
                description: "Updated Desc",
                distance: 99,
                duration: 7
            });

        expect(res.status).toBe(200);

        // updated
        expect(res.body.trip.title).toBe("Updated Title");
        expect(res.body.trip.description).toBe("Updated Desc");
        expect(res.body.trip.distance).toBe(99);
        expect(res.body.trip.duration).toBe(7);
    });

    test("ignores fields not in allowedFields", async () => {
        const creator = await User.create({
            name: "Tester",
            email: "test@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Valid Trip",
            description: "Desc",
            estimatedCost: {
                bike: { fuel: 20, tolls: 5 },
                car: { fuel: 40, tolls: 10 }
            },
            distance: 12,
            duration: 3,
            rating: 4.0,
            reviewCount: 2,
            difficulty: "easy",
            imageURLs: ["img.jpg"],
            altitudeSickness: false,
            status: "inactive",

            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [70, 20] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [72, 21] }
            },

            createdBy: creator._id
        });

        const res = await request(app)
            .put(`/api/v1/admin/trips/${trip._id}`)
            .send({
                title: "Updated Again",
                hackerField: "lol",
                randomGarbage: 123
            });

        expect(res.status).toBe(200);

        expect(res.body.trip.title).toBe("Updated Again");
        expect(res.body.trip.hackerField).toBeUndefined();
        expect(res.body.trip.randomGarbage).toBeUndefined();
    });

    test("invalidates cache after successful update", async () => {
        const creator = await User.create({
            name: "Creator",
            email: "creator@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Trip",
            description: "Desc",
            estimatedCost: {
                bike: { fuel: 20, tolls: 5 },
                car: { fuel: 50, tolls: 15 }
            },
            distance: 20,
            duration: 2,
            difficulty: "easy",
            imageURLs: ["img.jpg"],
            altitudeSickness: false,
            status: "active",

            startPoint: {
                name: "A",
                location: { type: "Point", coordinates: [10, 20] }
            },
            endPoint: {
                name: "B",
                location: { type: "Point", coordinates: [20, 30] }
            },

            createdBy: creator._id
        });

        const res = await request(app)
            .put(`/api/v1/admin/trips/${trip._id}`)
            .send({ title: "New" });

        expect(res.status).toBe(200);

        expect(invalidateAdminCache).toHaveBeenCalled();
    });

});

describe("PUT /api/v1/admin/trips/:id/status", () => {

    test("returns 400 for invalid Trip ID format", async () => {
        const res = await request(app)
            .put("/api/v1/admin/trips/INVALID/status")
            .send({ status: "active" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid Trip ID format");
    });

    test("returns 400 for invalid status value", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/admin/trips/${id}/status`)
            .send({ status: "verygoodstatus" });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid status value");
    });

    test("returns 404 when trip does not exist", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/admin/trips/${id}/status`)
            .send({ status: "active" });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

    test("updates trip status successfully", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "test@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Pending Trip",
            description: "A trek waiting for approval",
            estimatedCost: {
                bike: { fuel: 50, tolls: 10 },
                car: { fuel: 100, tolls: 20 }
            },
            distance: 20,
            duration: 3,
            rating: 4.2,
            reviewCount: 10,
            difficulty: "moderate",
            imageURLs: ["img.jpg"],
            altitudeSickness: false,
            status: "inactive",

            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [80, 17] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [81, 18] }
            },

            createdBy: user._id
        });

        const res = await request(app)
            .put(`/api/v1/admin/trips/${trip._id}/status`)
            .send({ status: "active" });

        expect(res.status).toBe(200);
        expect(res.body.trip.status).toBe("active");
        expect(res.body.message).toBe("Trip status updated to active");
    });

    test("invalidates admin cache after updating status", async () => {
        const user = await User.create({
            name: "Admin",
            email: "admin@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Trip For Cache",
            description: "Desc",
            estimatedCost: {
                bike: { fuel: 20, tolls: 5 },
                car: { fuel: 40, tolls: 10 }
            },
            distance: 10,
            duration: 2,
            difficulty: "easy",
            imageURLs: ["img.jpg"],
            altitudeSickness: false,
            status: "inactive",

            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [70, 20] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [72, 21] }
            },

            createdBy: user._id
        });

        const res = await request(app)
            .put(`/api/v1/admin/trips/${trip._id}/status`)
            .send({ status: "deleted" });

        expect(res.status).toBe(200);
        expect(invalidateAdminCache).toHaveBeenCalled();
    });

});

describe("DELETE /api/v1/admin/trips/:id", () => {

    test("returns 400 for invalid Trip ID format", async () => {
        const res = await request(app)
            .delete("/api/v1/admin/trips/INVALID_ID");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Invalid Trip ID format");
    });

    test("returns 404 when trip does not exist", async () => {
        const id = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .delete(`/api/v1/admin/trips/${id}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toBe("Trip not found");
    });

    test("deletes trip successfully", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Delete Me",
            description: "Going to disappear",
            estimatedCost: {
                bike: { fuel: 20, tolls: 5 },
                car: { fuel: 50, tolls: 10 }
            },
            distance: 20,
            duration: 3,
            difficulty: "easy",
            imageURLs: [],
            altitudeSickness: false,
            status: "active",
            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [80, 15] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [82, 17] }
            },
            createdBy: user._id
        });

        const res = await request(app).delete(`/api/v1/admin/trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Trip deleted successfully");

        const check = await Trip.findById(trip._id);
        expect(check).toBeNull();
    });

    test("calls cloudinary to delete images when imageURLs exist", async () => {
        const user = await User.create({
            name: "Uploader",
            email: "u@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Image Trip",
            description: "Has images",
            estimatedCost: {
                bike: { fuel: 10, tolls: 5 },
                car: { fuel: 20, tolls: 10 }
            },
            distance: 10,
            duration: 1,
            difficulty: "easy",
            imageURLs: ["img1.jpg", "img2.jpg"],
            altitudeSickness: false,
            status: "active",
            startPoint: {
                name: "A",
                location: { type: "Point", coordinates: [10, 20] }
            },
            endPoint: {
                name: "B",
                location: { type: "Point", coordinates: [30, 40] }
            },
            createdBy: user._id
        });

        const res = await request(app).delete(`/api/v1/admin/trips/${trip._id}`);

        expect(res.status).toBe(200);

        // wait image deletion to queue
        await new Promise(resolve => setImmediate(resolve));

        expect(cloudinary.api.delete_resources_by_prefix).toHaveBeenCalledWith(
            `trips/${trip._id}`
        );
    });

    test("invalidates admin cache after trip deletion", async () => {
        const user = await User.create({
            name: "Admin",
            email: "admin@test.com",
            password: "pass"
        });

        const trip = await Trip.create({
            title: "Cache Test Trip",
            description: "Cache invalidator",
            estimatedCost: {
                bike: { fuel: 10, tolls: 5 },
                car: { fuel: 20, tolls: 10 }
            },
            distance: 10,
            duration: 2,
            difficulty: "easy",
            imageURLs: [],
            altitudeSickness: false,
            status: "inactive",
            startPoint: {
                name: "S",
                location: { type: "Point", coordinates: [1, 2] }
            },
            endPoint: {
                name: "E",
                location: { type: "Point", coordinates: [3, 4] }
            },
            createdBy: user._id
        });

        const res = await request(app).delete(`/api/v1/admin/trips/${trip._id}`);

        expect(res.status).toBe(200);

        expect(invalidateAdminCache).toHaveBeenCalled();
    });

});

describe("GET /api/v1/admin/reports", () => {

    test("returns reports from cache when cache exists", async () => {
        fakeCache["admin_reports_list"] = [
            { reason: "Spam", reportedUser: { name: "Cached User" } }
        ];

        const res = await request(app).get("/api/v1/admin/reports");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.reports.length).toBe(1);
        expect(res.body.reports[0].reason).toBe("Spam");
    });

    test("returns reports from DB on cache miss and sets cache", async () => {
        fakeCache["admin_reports_list"] = null;

        const user1 = await User.create({
            name: "TargetUser",
            email: "target@test.com",
            password: "pass"
        });

        const user2 = await User.create({
            name: "Reporter",
            email: "rep@test.com",
            password: "pass"
        });

        await Report.create({
            target: user1._id,
            type: "User",
            reportedBy: user2._id,
            reason: "Harassment"
        });

        const res = await request(app).get("/api/v1/admin/reports");

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
        expect(res.body.reports.length).toBe(1);

        const report = res.body.reports[0];

        expect(report.reason).toBe("Harassment");
        expect(report.target.name).toBe("TargetUser");
        expect(report.reportedBy.email).toBe("rep@test.com");

        // Cache set
        expect(fakeCache["admin_reports_list"]).toBeDefined();
    });

    test("returns empty array if no reports exist", async () => {
        const res = await request(app).get("/api/v1/admin/reports");

        expect(res.status).toBe(200);
        expect(res.body.reports).toEqual([]);
        expect(res.body.source).toBe("db");
    });
});
