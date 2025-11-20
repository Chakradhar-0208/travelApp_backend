import request from "supertest";
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import mongoose from "mongoose";
import app from "../../index.js";
import Trip from "../../models/Trip.js";
import User from "../../models/User.js";
// import cloudinary from "../../config/cloudinary.js";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload.js";

import { v2 as cloudinary } from "cloudinary"

let fakeCache = {};
let mockUserId = new mongoose.Types.ObjectId().toString();
const createValidTrip = (override = {}) => ({
    title: "Trip",
    description: "Desc",
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
        bike: { fuel: 5, tolls: 2 },
    },
    createdBy: mockUserId,
    ...override
});

vi.mock("cloudinary", () => ({
    v2: {
        api: {
            delete_resources_by_prefix: vi.fn().mockResolvedValue(true),
        },
        uploader: {
            upload_stream: vi.fn(() => ({
                end: () => { }
            })),
        },
        config: vi.fn(), // prevents cloud_name lookup
    },
}));

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: mockUserId, role: "user" };
        next();
    }
}));

vi.mock("../../utils/caching/tripCache.js", () => ({
    getCache: (key) => fakeCache[key],
    setCache: (key, val) => (fakeCache[key] = val),
    invalidateTripCache: vi.fn()
}));

vi.mock("../../utils/cloudinaryUpload.js", () => ({
    uploadToCloudinary: vi.fn().mockResolvedValue({
        secure_url: "https://fakecloud.com/trip.jpg",
    }),
}));

// vi.mock("../../config/cloudinary.js", () => ({
//     default: {

//         api: {
//             delete_resources_by_prefix: vi.fn().mockResolvedValue(true),
//         },
//         uploader: {
//             upload_stream: vi.fn((opts, cb) => ({
//                 end: () => cb(null, { secure_url: "https://cloud.fake/new.jpg" })
//             })),
//         },
//         config: vi.fn(), // prevent cloudinary from loading real config
//     }
// }));

beforeEach(() => {
    vi.clearAllMocks();
})

describe("GET /api/v1/trips/:id", () => {

    test("returns trip from DB on cache miss and sets cache", async () => {
        const creator = await User.create({
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
        });

        const trip = await Trip.create({
            title: "Hill Ride",
            description: "A scenic ride",
            createdBy: creator._id,
            startPoint: { name: "A", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "B", location: { type: "Point", coordinates: [81, 18] } },
            distance: 100,
            duration: 5,
            estimatedCost: {
                car: { fuel: 50, tolls: 10 },
                bike: { fuel: 20, tolls: 5 }
            }
        });

        const res = await request(app).get(`/api/v1/trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("db");
        expect(res.body.trip.title).toBe("Hill Ride");

        // populated user field
        expect(res.body.trip.createdBy.name).toBe("Kiran");

        // cache should be set
        const key = `trip:${trip._id}`;
        expect(fakeCache[key]).toBeDefined();
        expect(fakeCache[key].title).toBe("Hill Ride");
    });

    test("returns cached result when cache exists", async () => {
        const tripId = new mongoose.Types.ObjectId().toString();

        fakeCache[`trip:${tripId}`] = { title: "Cached Trip", distance: 50 };

        const res = await request(app).get(`/api/v1/trips/${tripId}`);

        expect(res.status).toBe(200);
        expect(res.body.source).toBe("cache");
        expect(res.body.trip.title).toBe("Cached Trip");
    });

    test("returns 404 when trip does not exist", async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();

        const res = await request(app).get(`/api/v1/trips/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

});

describe("POST /api/v1/trips/:id/save", () => {

    test("returns 404 if trip not found", async () => {
        const fakeTripId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .post(`/api/v1/trips/${fakeTripId}/save`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

    test("returns 404 if user not found", async () => {
        // create trip but do NOT create user
        const trip = await Trip.create({
            title: "T1",
            description: "Desc",
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            distance: 10,
            duration: 1,
            estimatedCost: {
                car: { fuel: 100, tolls: 20 },
                bike: { fuel: 50, tolls: 10 }
            }
        });

        const res = await request(app)
            .post(`/api/v1/trips/${trip._id}/save`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("User not found");
    });

    test("returns 400 if trip already saved", async () => {
        const trip = await Trip.create({
            title: "Trip X",
            description: "Nice",
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            distance: 20,
            duration: 2,
            estimatedCost: {
                car: { fuel: 100, tolls: 20 },
                bike: { fuel: 50, tolls: 10 }
            }
        });

        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@v.com",
            password: "pass",
            savedTrips: [trip._id]
        });

        const res = await request(app)
            .post(`/api/v1/trips/${trip._id}/save`);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Trip already saved");
    });

    test("saves trip successfully", async () => {
        const trip = await Trip.create({
            title: "New Trip",
            description: "Awesome trip",
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            distance: 15,
            duration: 1.5,
            estimatedCost: {
                car: { fuel: 100, tolls: 10 },
                bike: { fuel: 50, tolls: 5 }
            }
        });

        await User.create({
            _id: mockUserId,
            name: "Test User",
            email: "t@test.com",
            password: "pass",
            savedTrips: []
        });

        const res = await request(app)
            .post(`/api/v1/trips/${trip._id}/save`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Trip saved successfully");

        const user = await User.findById(mockUserId);
        expect(user.savedTrips.length).toBe(1);
        expect(user.savedTrips[0].toString()).toBe(trip._id.toString());
    });

});

describe("POST /api/v1/trips", () => {

    test("creates a trip successfully (no images)", async () => {
        const body = {
            title: "Hilltop Adventure",
            description: "Amazing journey",
            distance: "120",
            duration: "4",

            startPoint: JSON.stringify({
                name: "Start City",
                location: { type: "Point", coordinates: [80, 17] }
            }),
            endPoint: JSON.stringify({
                name: "End City",
                location: { type: "Point", coordinates: [81, 18] }
            }),

            estimatedCost: JSON.stringify({
                car: { fuel: 1000, tolls: 200, accommodation: 0, food: 300, parking: 100 },
                bike: { fuel: 500, tolls: 50, accommodation: 0, food: 100, parking: 50 }
            })
        };

        const res = await request(app)
            .post("/api/v1/trips")
            .field("title", body.title)
            .field("description", body.description)
            .field("distance", body.distance)
            .field("duration", body.duration)
            .field("startPoint", body.startPoint)
            .field("endPoint", body.endPoint)
            .field("estimatedCost", body.estimatedCost);
        expect(res.status).toBe(201);
        expect(res.body.message).toBe("Trip created successfully");

        const saved = await Trip.findById(res.body.trip._id);
        expect(saved).not.toBeNull();

        expect(saved.status).toBe("inactive");
        expect(saved.createdBy.toString()).toBe(mockUserId.toString());

        // totalCost computed?
        expect(saved.estimatedCost.car.total).toBe(1600);
        expect(saved.estimatedCost.bike.total).toBe(700);
    });

    test("uploads images and attaches URLs", async () => {
        const res = await request(app)
            .post("/api/v1/trips")
            .field("title", "Test Trip")
            .field("description", "Desc")
            .field("distance", "50")
            .field("duration", "2")
            .field("startPoint", JSON.stringify({ name: "A", location: { type: "Point", coordinates: [80, 17] } }))
            .field("endPoint", JSON.stringify({ name: "B", location: { type: "Point", coordinates: [81, 18] } }))
            .field(
                "estimatedCost",
                JSON.stringify({
                    car: {
                        fuel: 100,
                        tolls: 20,
                        accommodation: 0,
                        food: 50,
                        parking: 10,
                    },
                    bike: {
                        fuel: 50,
                        tolls: 10,
                        accommodation: 0,
                        food: 20,
                        parking: 5,
                    },
                })
            )
            .attach("images", Buffer.from("fakeimg"), "photo.jpg");

        expect(res.status).toBe(201);

        const trip = await Trip.findById(res.body.trip._id);
        expect(trip.imageURLs.length).toBe(1);
        expect(trip.imageURLs[0]).toBe("https://fakecloud.com/trip.jpg");
    });

    test("returns 400 if required fields are missing", async () => {
        const res = await request(app)
            .post("/api/v1/trips")
            .field("title", "No Distance Trip");

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });

    test("parses JSON fields correctly", async () => {
        const res = await request(app)
            .post("/api/v1/trips")
            .field("title", "JSON Test")
            .field("description", "Desc")
            .field("distance", "30")
            .field("duration", "1")
            .field("startPoint", JSON.stringify({
                name: "X",
                location: { type: "Point", coordinates: [80, 17] },
            }))
            .field("endPoint", JSON.stringify({
                name: "Y",
                location: { type: "Point", coordinates: [81, 19] },
            }))
            .field(
                "estimatedCost",
                JSON.stringify({
                    car: {
                        fuel: 100,
                        tolls: 20,
                        accommodation: 0,
                        food: 50,
                        parking: 10,
                    },
                    bike: {
                        fuel: 50,
                        tolls: 10,
                        accommodation: 0,
                        food: 20,
                        parking: 5,
                    },
                })
            );

        expect(res.status).toBe(201);

        const saved = await Trip.findById(res.body.trip._id);

        expect(saved.startPoint.name).toBe("X");
        expect(saved.endPoint.name).toBe("Y");
        expect(saved.estimatedCost.car.fuel).toBe(100);
    });

    test("forces status to inactive even if sent in request", async () => {
        const res = await request(app)
            .post("/api/v1/trips")
            .field("title", "Force Test")
            .field("description", "Desc")
            .field("distance", "42")
            .field("duration", "2")
            .field("status", "active") // should be ignored
            .field("startPoint", JSON.stringify({ name: "A", location: { type: "Point", coordinates: [80, 17] } }))
            .field("endPoint", JSON.stringify({ name: "B", location: { type: "Point", coordinates: [81, 18] } }))
            .field(
                "estimatedCost",
                JSON.stringify({
                    car: {
                        fuel: 100,
                        tolls: 20,
                        accommodation: 0,
                        food: 50,
                        parking: 10,
                    },
                    bike: {
                        fuel: 50,
                        tolls: 10,
                        accommodation: 0,
                        food: 20,
                        parking: 5,
                    },
                })
            );


        expect(res.status).toBe(201);

        const saved = await Trip.findById(res.body.trip._id);

        expect(saved.status).toBe("inactive"); // Always
    });

});

describe("PUT /api/v1/trips/:id", () => {

    test("returns 404 when trip does not exist", async () => {
        const fakeId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/trips/${fakeId}`)
            .send({ title: "New Title" });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

    test("returns 403 when user is not the creator of the trip", async () => {
        const creator = new mongoose.Types.ObjectId();
        const trip = await Trip.create(createValidTrip({
            title: "Old",
            description: "Old Desc",
            createdBy: creator,
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            }
        }));

        const res = await request(app)
            .put(`/api/v1/trips/${trip._id}`)
            .send({ title: "Hack Attempt" });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe("You are not authorized to update this trip");
    });

    test("updates allowed fields successfully without touching images", async () => {
        const trip = await Trip.create(createValidTrip({
            title: "Original",
            description: "Desc",
            createdBy: mockUserId,
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            },
            imageURLs: ["keep.jpg"]
        }));

        const res = await request(app)
            .put(`/api/v1/trips/${trip._id}`)
            .send({
                title: "Updated Title",
                distance: 100,
                checkPoints: JSON.stringify([
                    {
                        name: "Spot A",
                        location: {
                            type: "Point",
                            coordinates: [80, 17],
                        },
                    },
                ]),
            });

        expect(res.status).toBe(200);
        expect(res.body.updatedTrip.title).toBe("Updated Title");
        expect(res.body.updatedTrip.distance).toBe(100);

        // Images must remain unchanged
        expect(res.body.updatedTrip.imageURLs[0]).toBe("keep.jpg");
    });

    test("updates trip & replaces images", async () => {
        const trip = await Trip.create(createValidTrip({
            title: "Original",
            createdBy: mockUserId,
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            },
            imageURLs: ["old1.jpg", "old2.jpg"],
        }));

        const res = await request(app)
            .put(`/api/v1/trips/${trip._id}`)
            .attach("images", Buffer.from("fake"), "photo1.jpg")
            .attach("images", Buffer.from("fake"), "photo2.jpg");
        console.log(res.body)
        expect(res.statusCode).toBe(200);

        expect(cloudinary.api.delete_resources_by_prefix)
            .toHaveBeenCalledWith(`trips/${trip._id}`);

        expect(uploadToCloudinary).toHaveBeenCalled();

        expect(res.body.updatedTrip.imageURLs.length).toBe(2);
        expect(res.body.updatedTrip.imageURLs[0]).toBe("https://fakecloud.com/trip.jpg");
    });

    test("ignores unknown fields in request body", async () => {
        const trip = await Trip.create(createValidTrip({
            title: "Original",
            createdBy: mockUserId,
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            },
        }));

        const res = await request(app)
            .put(`/api/v1/trips/${trip._id}`)
            .send({
                title: "Clean Title",
                hackerField: "should not exist"
            });

        expect(res.status).toBe(200);

        const updated = await Trip.findById(trip._id).lean();
        expect(updated.hackerField).toBeUndefined();
    });

    test("recalculates cost totals after update", async () => {
        const trip = await Trip.create(createValidTrip({
            title: "Costs Trip",
            createdBy: mockUserId,
            estimatedCost: {
                car: { fuel: 20, tolls: 10 },
                bike: { fuel: 10, tolls: 5 }
            }
        }));

        const res = await request(app)
            .put(`/api/v1/trips/${trip._id}`)
            .send({
                estimatedCost: JSON.stringify({
                    car: { fuel: 30, tolls: 20 },
                    bike: { fuel: 15, tolls: 5 }
                })
            });

        expect(res.status).toBe(200);

        const updated = await Trip.findById(trip._id).lean();
        expect(updated.estimatedCost.car.total).toBe(50);
        expect(updated.estimatedCost.bike.total).toBe(20);
    });

});

describe("DELETE /api/v1/trips/:id", () => {

    test("returns 404 when trip does not exist", async () => {
        const fakeId = new mongoose.Types.ObjectId();

        const res = await request(app).delete(`/api/v1/trips/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Trip not found");
    });

    test("returns 403 when user is not the creator", async () => {
        const trip = await Trip.create(createValidTrip({
            title: "Trip",
            description: "Test",
            distance: 10,
            duration: 2,
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            },
            createdBy: new mongoose.Types.ObjectId(), // DIFFERENT USER
            imageURLs: []
        }));

        const res = await request(app).delete(`/api/v1/trips/${trip._id}`);
        console.log(res.body)
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("You are not authorized to delete this trip");
    });

    test("deletes trip and triggers cloudinary deletion when images exist", async () => {
        const trip = await Trip.create({
            title: "Trip",
            description: "Test",
            distance: 10,
            duration: 2,
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            },
            createdBy: mockUserId,
            imageURLs: ["img1.jpg", "img2.jpg"]
        });

        const res = await request(app).delete(`/api/v1/trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Trip deleted successfully");

        // cloudinary must be triggered
        expect(cloudinary.api.delete_resources_by_prefix)
            .toHaveBeenCalledWith(`trips/${trip._id}`);

        // trip should be removed
        const deleted = await Trip.findById(trip._id);
        expect(deleted).toBeNull();
    });

    test("deletes trip without cloudinary call when no images", async () => {
        const trip = await Trip.create({
            title: "Trip No Image",
            description: "Test",
            distance: 10,
            duration: 2,
            startPoint: { name: "S", location: { type: "Point", coordinates: [80, 17] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [81, 18] } },
            estimatedCost: {
                car: { fuel: 10, tolls: 2 },
                bike: { fuel: 5, tolls: 1 }
            },
            createdBy: mockUserId,
            imageURLs: []
        });

        const res = await request(app).delete(`/api/v1/trips/${trip._id}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Trip deleted successfully");

        // should NOT call Cloudinary
        expect(cloudinary.api.delete_resources_by_prefix).not.toHaveBeenCalled();
    });

});

describe("DELETE /api/v1/trips/saved-trips/:tripId", () => {

    test("returns 400 if tripId is missing", async () => {
        const res = await request(app)
            .delete("/api/v1/trips/saved-trips/"); // invalid route

        expect(res.status).toBe(400);
    });

    test("returns 400 if tripId is invalid", async () => {
        const res = await request(app)
            .delete("/api/v1/trips/saved-trips/invalid-id");

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Invalid Trip Id");
    });

    test("returns 400 if trip is not in saved list", async () => {
        const user = await User.create({
            name: "Kiran",
            email: "k@k.com",
            password: "pass",
            savedTrips: []
        });

        // mock user ID from auth
        mockUserId = user._id;

        const tripId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/trips/saved-trips/${tripId}`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("This trip is not in saved list");
    });

    test("successfully removes trip from saved list", async () => {
        const tripId = new mongoose.Types.ObjectId();

        const user = await User.create({
            name: "Kiran",
            email: "save@trip.com",
            password: "pass",
            savedTrips: [tripId] // already saved
        });

        mockUserId = user._id; // override auth mock

        const res = await request(app)
            .delete(`/api/v1/trips/saved-trips/${tripId}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("success");

        const updatedUser = await User.findById(user._id);

        expect(updatedUser.savedTrips.includes(tripId.toString())).toBe(false);
    });

});

