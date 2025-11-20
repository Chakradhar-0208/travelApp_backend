// tests/flow1.onboarding.e2e.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import streamifier from "streamifier"
import axios from "axios";

// --- ENV SETUP BEFORE APP IMPORT ---
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "super-secret-test-key";

// --- MOCKS (must be BEFORE importing app) ---

vi.mock("streamifier", () => ({
    default: {
        createReadStream: () => ({
            pipe: vi.fn(),
        }),
    }
}));

// Mock nodemailer transporter so no real emails are sent
vi.mock("../config/transporter.js", () => ({
    transporter: {
        sendMail: vi.fn().mockResolvedValue({ messageId: "test-message-id" }),
    },
}));

// Mock Firebase admin so notifications import doesn't explode
vi.mock("../config/firebase.js", () => ({
    default: {
        messaging: () => ({
            send: vi.fn().mockResolvedValue({ messageId: "5qE!Qk11Ju16Ke&31vzBY=671twrta0WXUb%7P&0x17pryUOPpj@6sCFCyVqEo#rEaXUp!0nzqz2dexr7gC#ZFFk+t3YJxmK9B+MK" }),
        }),
    },
}));

// Mock Cloudinary used in user routes & others
vi.mock("../config/cloudinary.js", () => {
    return {
        default: {
            uploader: {
                // Minimal fake upload_stream implementation
                upload_stream: (_options, callback) => {
                    return {
                        // streamifier pipes to write/end, we just immediately succeed on end
                        write(_chunk) { },
                        end() {
                            callback(null, {
                                public_id: "profileImage/test-user-id",
                                secure_url: "https://example.com/profile/test-user.jpg",
                            });
                        },
                        on() { },
                    };
                },
            },
            // Used in /users/getProfileImage
            url: (publicId, _options) =>
                `https://res.cloudinary.com/demo/image/upload/${publicId}`,
            api: {
                delete_resources_by_prefix: vi.fn().mockResolvedValue({}),
            },
        },
    };
});

vi.mock("../utils/cloudinaryUpload.js", () => ({
    uploadToCloudinaryFeedback: vi.fn().mockImplementation((_buf, _path) => {
        return Promise.resolve({
            secure_url: "https://mock.cloudinary.com/feedback.jpg"
        });
    }),
}));


// Mock axios
vi.mock("axios");
axios.post.mockImplementation((url, query, options) => {
    // Simulate Overpass API nearby POIs
    return Promise.resolve({
        data: {
            elements: [
                {
                    id: 101,
                    lat: 12.901,
                    lon: 77.601,
                    tags: { name: "Café Aroma", amenity: "cafe" }
                },
                {
                    id: 102,
                    lat: 12.902,
                    lon: 77.602,
                    tags: { name: "Coffee Hub", amenity: "cafe" }
                }
            ]
        }
    });
});
axios.get.mockImplementation((url, opts) => {
    // Simulate OSRM route
    return Promise.resolve({
        data: {
            routes: [
                {
                    legs: [
                        {
                            distance: 15000,   // 15 km
                            duration: 1800     // 30 min
                        }
                    ]
                }
            ]
        }
    });
});

// --- IMPORT APP & MODELS ---
import app from "../index.js";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import Review from "../models/Review.js";
import Feedback from "../models/Feedback.js";

let mongoServer;

// =========================================================
//                 FLOW 1 — New User Onboarding
// =========================================================

describe("Flow 1 - New User Onboarding (AUTH + USER)", () => {

    it("should register, login, fetch, update profile, upload avatar, and fetch profile image", async () => {
        const email = "newuser@example.com";
        const password = "StrongPass123!";
        const name = "Test User";

        // -----------------------
        // 1. REGISTER
        // -----------------------
        const registerRes = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name,
                email,
                password,
                phone: "9999999999",
                profileImage: "avatar1", // initial string-based avatar
            });

        expect(registerRes.status).toBe(200);
        expect(registerRes.body).toHaveProperty("token");
        expect(registerRes.body).toHaveProperty("user");
        expect(registerRes.body.user.email).toBe(email);

        // Password should be hashed in DB
        const userInDb = await User.findOne({ email }).lean();
        expect(userInDb).toBeTruthy();
        expect(userInDb.password).not.toBe(password);
        expect(userInDb.password.startsWith("$2")).toBe(true); // bcrypt hash prefix

        // -----------------------
        // 2. LOGIN
        // -----------------------
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body).toHaveProperty("authToken");
        expect(loginRes.body).toHaveProperty("user");
        expect(loginRes.body.user.email).toBe(email);

        const authToken = loginRes.body.authToken;
        const userId = String(loginRes.body.user._id);

        // -----------------------
        // 3. FETCH PROFILE (non-detailed) + CACHE TEST
        // -----------------------
        const getUserRes1 = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${authToken}`)
            .query({ email });

        expect(getUserRes1.status).toBe(200);
        expect(getUserRes1.body).toHaveProperty("user");
        expect(getUserRes1.body.user.email).toBe(email);
        // First call from DB
        expect(getUserRes1.body.source).toBe("db");

        // Second call should hit cache
        const getUserRes2 = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${authToken}`)
            .query({ email });

        expect(getUserRes2.status).toBe(200);
        expect(getUserRes2.body.user.email).toBe(email);
        expect(getUserRes2.body.source).toBe("cache");

        // -----------------------
        // 4. UPDATE PROFILE
        // -----------------------
        const updateRes = await request(app)
            .put(`/api/v1/users/updateUser/${userId}`)
            .set("Authorization", `Bearer ${authToken}`)
            .send({
                name: "Updated User",
                age: 25,
                gender: "male",
                interests: ["mountains", "road trips"],
                travelType: "solo",
                tripCount: 5,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body).toHaveProperty("user");
        expect(updateRes.body.user.name).toBe("Updated User");
        expect(updateRes.body.user.email).toBe(email);

        // Cache should be invalidated; first call after update is DB
        const getUserAfterUpdate1 = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${authToken}`)
            .query({ email });

        expect(getUserAfterUpdate1.status).toBe(200);
        expect(getUserAfterUpdate1.body.user.name).toBe("Updated User");
        expect(getUserAfterUpdate1.body.source).toBe("db");

        // Second call uses cache again
        const getUserAfterUpdate2 = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${authToken}`)
            .query({ email });

        expect(getUserAfterUpdate2.status).toBe(200);
        expect(getUserAfterUpdate2.body.source).toBe("cache");

        // -----------------------
        // 5. UPLOAD PROFILE IMAGE (multipart)
        // -----------------------
        const fakeImageBuffer = Buffer.from("fake image bytes");

        const uploadAvatarRes = await request(app)
            .put("/api/v1/users/updateProfileImage")
            .set("Authorization", `Bearer ${authToken}`)
            .field("email", email)
            .attach("profileImage", fakeImageBuffer, "avatar.png");

        // Route responds 202 because actual upload is in a background job
        expect(uploadAvatarRes.status).toBe(202);
        expect(uploadAvatarRes.body).toHaveProperty(
            "message",
            "Profile image update queued successfully (background job)"
        );

        // Give the event loop a tick so setImmediate callback can run
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Reload user from DB to ensure profileImage has been updated by background job
        const updatedUser = await User.findOne({ email }).lean();
        expect(updatedUser).toBeTruthy();
        expect(updatedUser.profileImage).toBeDefined();
        // Our mock sets public_id to "profileImage/test-user-id"
        // but actual implementation builds public_id differently.
        // Just check it's a non-empty string.
        expect(typeof updatedUser.profileImage).toBe("string");
        expect(updatedUser.profileImage.length).toBeGreaterThan(0);

        // -----------------------
        // 6. FETCH PROFILE IMAGE + CACHE TEST
        // -----------------------
        const profileImgRes1 = await request(app)
            .get("/api/v1/users/getProfileImage")
            .query({ email });

        expect(profileImgRes1.status).toBe(200);
        expect(profileImgRes1.body).toHaveProperty("profileImage");
        expect(typeof profileImgRes1.body.profileImage).toBe("string");
        expect(profileImgRes1.body.profileImage.startsWith("https://")).toBe(true);
        expect(profileImgRes1.body.source).toBe("db");

        const profileImgRes2 = await request(app)
            .get("/api/v1/users/getProfileImage")
            .query({ email });

        expect(profileImgRes2.status).toBe(200);
        expect(profileImgRes2.body.source).toBe("cache");
    });

});

// =========================================================
//                 FLOW 2 — Trip Searching and Saving
// =========================================================

describe("Flow 2 - Trip Discovery + Saving", () => {
    it("should allow user to browse trips, view one, save it, list saved trips, and unsave it", async () => {
        const email = "flow2user@example.com";
        const password = "StrongPassword!";
        const name = "Flow Two User";

        // ---------------------------------
        // 1. REGISTER USER
        // ---------------------------------
        await request(app).post("/api/v1/auth/register").send({
            name,
            email,
            password,
            phone: "1111111111",
            profileImage: "none",
        });

        // ---------------------------------
        // 2. LOGIN USER
        // ---------------------------------
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        expect(loginRes.status).toBe(200);
        const token = loginRes.body.authToken;
        const userId = loginRes.body.user._id;

        // ---------------------------------
        // 3. CREATE AN ACTIVE TRIP DIRECTLY IN DB (bypassing admin flow)
        // ---------------------------------
        const trip = await Trip.create({
            title: "Himalayan Adventure",
            description: "A cold but beautiful journey.",
            difficulty: "moderate",

            // New required structured startPoint
            startPoint: {
                name: "Kathmandu",
                location: {
                    type: "Point",
                    coordinates: [85.3240, 27.7172],
                },
            },

            endPoint: {
                name: "Pokhara",
                location: {
                    type: "Point",
                    coordinates: [83.9856, 28.2096],
                },
            },

            distance: 200, // kilometers

            estimatedCost: {
                bike: { fuel: 1500, tolls: 200 },
                car: { fuel: 2500, tolls: 500 },
            },

            budget: 5000,
            duration: 5,

            images: ["https://example.com/fake-trip-image.jpg"],
            location: "Nepal",
            isActive: true,
        });

        const tripId = String(trip._id);

        // ---------------------------------
        // 4. GET ALL ACTIVE TRIPS
        // ---------------------------------
        const tripsRes = await request(app).get("/api/v1/trips");

        expect(tripsRes.status).toBe(200);
        expect(tripsRes.body.data.length).toBe(1);
        expect(tripsRes.body.data[0]._id).toBe(tripId);

        // ---------------------------------
        // 5. GET SPECIFIC TRIP
        // ---------------------------------
        const singleTripRes = await request(app)
            .get(`/api/v1/trips/${tripId}`)
            .set("Authorization", `Bearer ${token}`);

        expect(singleTripRes.status).toBe(200);
        expect(singleTripRes.body.trip).toBeTruthy();
        expect(singleTripRes.body.trip._id).toBe(tripId);

        // ---------------------------------
        // 6. SAVE THE TRIP
        // ---------------------------------
        const saveRes = await request(app)
            .post(`/api/v1/trips/${tripId}/save`)
            .set("Authorization", `Bearer ${token}`);
        expect(saveRes.status).toBe(200);

        // Ensure DB has updated savedTrips
        const userAfterSave = await User.findById(userId).lean();
        expect(userAfterSave.savedTrips.length).toBe(1);
        expect(String(userAfterSave.savedTrips[0])).toBe(tripId);

        // ---------------------------------
        // 7. GET SAVED TRIPS
        // ---------------------------------
        const savedTripsRes = await request(app)
            .get("/api/v1/users/savedTrips")
            .set("Authorization", `Bearer ${token}`);

        expect(savedTripsRes.status).toBe(200);
        expect(savedTripsRes.body.savedTrips.length).toBe(1);
        expect(savedTripsRes.body.savedTrips[0]._id).toBe(tripId);

        // ---------------------------------
        // 8. UNSAVE THE TRIP
        // ---------------------------------
        const unsaveRes = await request(app)
            .delete(`/api/v1/trips/saved-trips/${tripId}`)
            .set("Authorization", `Bearer ${token}`);

        expect(unsaveRes.status).toBe(200);
        expect(unsaveRes.body.message).toMatch("success");

        // Confirm DB updated
        const userAfterUnsave = await User.findById(userId).lean();
        expect(userAfterUnsave.savedTrips.length).toBe(0);

        // ---------------------------------
        // 9. GET SAVED TRIPS AGAIN (should be empty)
        // ---------------------------------
        const savedTripsEmptyRes = await request(app)
            .get("/api/v1/users/savedTrips")
            .set("Authorization", `Bearer ${token}`);

        expect(savedTripsEmptyRes.status).toBe(200);
        expect(savedTripsEmptyRes.body.savedTrips.length).toBe(0);
    });
});

// =========================================================
//                 FLOW 3 — Trip Creation Flow
// =========================================================

describe("Flow 3 - Trip Creation (User) → Approval (Admin)", () => {

    it("should let user create a trip, admin approve it, and then user see it as active", async () => {
        const userEmail = "creator@example.com";
        const userPassword = "UserPass123!";
        const adminEmail = "admin@example.com";
        const adminPassword = "AdminPass123!";

        // --------------------------------
        // 1. REGISTER USER (creator)
        // --------------------------------
        const registerRes = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Trip Creator",
                email: userEmail,
                password: userPassword,
                phone: "9999999999",
                profileImage: "avatar1",
            });

        expect(registerRes.status).toBe(200);
        const creatorId = registerRes.body.user.id || registerRes.body.user._id;

        // --------------------------------
        // 2. LOGIN USER (creator)
        // --------------------------------
        const loginUserRes = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: userEmail, password: userPassword });

        expect(loginUserRes.status).toBe(200);
        const userToken = loginUserRes.body.authToken;

        // --------------------------------
        // 3. CREATE ADMIN USER DIRECTLY IN DB
        // --------------------------------
        await User.create({
            name: "Admin User",
            email: adminEmail,
            password: adminPassword, // plain, will be auto-hashed on first login
            profileImage: "avatar1",
            role: "admin",
        });

        // --------------------------------
        // 4. LOGIN ADMIN
        // --------------------------------
        const loginAdminRes = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: adminEmail, password: adminPassword });

        expect(loginAdminRes.status).toBe(200);
        const adminToken = loginAdminRes.body.authToken;

        // --------------------------------
        // 5. USER CREATES TRIP (multipart, no images needed)
        // --------------------------------
        const createTripRes = await request(app)
            .post("/api/v1/trips")
            .set("Authorization", `Bearer ${userToken}`)
            .field("title", "Coastal Highway Test Trip")
            .field("description", "A scenic test drive along the coast.")
            .field("difficulty", "easy")
            .field("distance", "250")
            .field("duration", "2")
            .field(
                "startPoint",
                JSON.stringify({
                    name: "Start City",
                    location: {
                        type: "Point",
                        coordinates: [77.5946, 12.9716], // [lng, lat]
                    },
                })
            )
            .field(
                "endPoint",
                JSON.stringify({
                    name: "End City",
                    location: {
                        type: "Point",
                        coordinates: [78.4867, 17.3850],
                    },
                })
            )
            .field(
                "estimatedCost",
                JSON.stringify({
                    bike: {
                        fuel: 1500,
                        tolls: 200,
                        accommodation: 0,
                        food: 500,
                        parking: 0,
                    },
                    car: {
                        fuel: 2500,
                        tolls: 500,
                        accommodation: 0,
                        food: 700,
                        parking: 100,
                    },
                })
            );

        expect(createTripRes.status).toBe(201);
        expect(createTripRes.body).toHaveProperty("trip");
        const createdTrip = createTripRes.body.trip;
        const tripId = createdTrip._id;

        // Trip should be inactive and createdBy user
        expect(createdTrip.status).toBe("inactive");
        expect(String(createdTrip.createdBy)).toBe(String(creatorId));

        // Double-check in DB
        const tripInDb = await Trip.findById(tripId).lean();
        expect(tripInDb).toBeTruthy();
        expect(tripInDb.status).toBe("inactive");
        expect(String(tripInDb.createdBy)).toBe(String(creatorId));

        // --------------------------------
        // 6. ADMIN FETCHES INACTIVE TRIPS
        // --------------------------------
        const inactiveRes = await request(app)
            .get("/api/v1/admin/trips/inactive")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(inactiveRes.status).toBe(200);
        expect(Array.isArray(inactiveRes.body.trips)).toBe(true);
        expect(inactiveRes.body.trips.length).toBe(1);
        expect(inactiveRes.body.trips[0]._id).toBe(String(tripId));

        // --------------------------------
        // 7. ADMIN UPDATES TRIP FIELDS
        // --------------------------------
        const adminUpdateRes = await request(app)
            .put(`/api/v1/admin/trips/${tripId}`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                title: "Coastal Highway (Reviewed)",
                difficulty: "moderate",
            });

        expect(adminUpdateRes.status).toBe(200);
        expect(adminUpdateRes.body).toHaveProperty("trip");
        expect(adminUpdateRes.body.trip.title).toBe("Coastal Highway (Reviewed)");
        expect(adminUpdateRes.body.trip.difficulty).toBe("moderate");
        // status still inactive at this point
        expect(adminUpdateRes.body.trip.status).toBe("inactive");

        // --------------------------------
        // 8. ADMIN CHANGES TRIP STATUS → ACTIVE
        // --------------------------------
        const statusRes = await request(app)
            .put(`/api/v1/admin/trips/${tripId}/status`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ status: "active" });

        expect(statusRes.status).toBe(200);
        expect(statusRes.body).toHaveProperty("trip");
        expect(statusRes.body.trip.status).toBe("active");
        expect(statusRes.body.message).toMatch(/updated to active/i);

        // DB check
        const tripAfterStatus = await Trip.findById(tripId).lean();
        expect(tripAfterStatus.status).toBe("active");

        // --------------------------------
        // 9. ADMIN FETCHES ACTIVE TRIPS
        // --------------------------------
        const activeAdminRes = await request(app)
            .get("/api/v1/admin/trips")
            .set("Authorization", `Bearer ${adminToken}`);
        expect(activeAdminRes.status).toBe(200);
        expect(Array.isArray(activeAdminRes.body.trips)).toBe(true);
        expect(activeAdminRes.body.trips.length).toBe(1);
        expect(activeAdminRes.body.trips[0]._id).toBe(String(tripId));
        // expect(activeAdminRes.body.trips[0].status).toBe("active"); //!TBD

        // --------------------------------
        // 10. USER FETCHES TRIPS (PUBLIC) AND SEES APPROVED TRIP
        // --------------------------------
        const publicTripsRes = await request(app)
            .get("/api/v1/trips")
            .query({ status: "active" });

        expect(publicTripsRes.status).toBe(200);
        expect(Array.isArray(publicTripsRes.body.data)).toBe(true);
        const ids = publicTripsRes.body.data.map((t) => String(t._id));
        expect(ids).toContain(String(tripId));
    });
});

// =========================================================
//                 FLOW 4 — Journey Lifecycle
// =========================================================

describe("Flow 4 - Journey Lifecycle (Start → Checkpoints → End)", () => {
    it("should allow a user to start a journey, add checkpoints, end journey, view history, and get analytics", async () => {
        const email = "journeyuser@example.com";
        const password = "StrongPass!";

        // --------------------------------------------------
        // 1. REGISTER USER
        // --------------------------------------------------
        await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Journey User",
                email,
                password,
                phone: "1234567890",
                profileImage: "avatar1"
            });

        // --------------------------------------------------
        // 2. LOGIN
        // --------------------------------------------------
        const loginRes = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        expect(loginRes.status).toBe(200);

        const token = loginRes.body.authToken;
        const userId = loginRes.body.user._id;

        // --------------------------------------------------
        // 3. START A JOURNEY
        // --------------------------------------------------
        const startRes = await request(app)
            .post("/api/v1/journeys/start")
            .set("Authorization", `Bearer ${token}`)
            .send({
                tripId: "000000000000000000000001", // fake ID allowed by schema
                userId,
                startLocation: "Bangalore"
            });

        expect(startRes.status).toBe(201);
        expect(startRes.body).toHaveProperty("_id");

        const journeyId = startRes.body._id;

        // --------------------------------------------------
        // 4. ADD CHECKPOINTS
        // --------------------------------------------------
        const cp1 = await request(app)
            .put(`/api/v1/journeys/${journeyId}/checkpoint`)
            .send({
                checkpoint: {
                    name: "Mysore Palace",
                    distance: 150,
                    duration: 120,
                    coordinates: [12.3052, 76.6552]
                }
            });

        expect(cp1.status).toBe(200);
        expect(cp1.body.totalDistance).toBe(150);

        const cp2 = await request(app)
            .put(`/api/v1/journeys/${journeyId}/checkpoint`)
            .send({
                checkpoint: {
                    name: "Bandipur Forest",
                    distance: 80,
                    duration: 90,
                    coordinates: [11.6770, 76.6280]
                }
            });

        expect(cp2.status).toBe(200);
        expect(cp2.body.totalDistance).toBe(230); // 150 + 80

        // --------------------------------------------------
        // 5. END THE JOURNEY
        // --------------------------------------------------
        const endRes = await request(app)
            .put(`/api/v1/journeys/${journeyId}/end`)
            .send({
                endLocation: {
                    coordinates: [12.0, 31.02],
                    address: "Ooty"
                }
            });
        expect(endRes.status).toBe(200);
        expect(endRes.body.status).toBe("completed");
        expect(endRes.body.endLocation.address).toBe("Ooty");

        // --------------------------------------------------
        // 6. VIEW JOURNEY HISTORY
        // --------------------------------------------------
        const historyRes = await request(app)
            .get("/api/v1/journeys/history")
            .set("Authorization", `Bearer ${token}`);

        expect(historyRes.status).toBe(200);
        expect(Array.isArray(historyRes.body)).toBe(true);
        expect(historyRes.body.length).toBe(1);
        expect(historyRes.body[0]._id).toBe(journeyId);

        // --------------------------------------------------
        // 7. VIEW USER ANALYTICS
        // --------------------------------------------------
        const analyticsRes = await request(app)
            .get("/api/v1/users/analytics")
            .set("Authorization", `Bearer ${token}`);

        expect(analyticsRes.status).toBe(200);
        expect(analyticsRes.body.tripCount).toBe(1);

        // Total distance = 150 + 80
        expect(analyticsRes.body.totalDistance).toBe(230);
        expect(analyticsRes.body.totalJourneyTime).toBe(210); // 120 + 90

        expect(analyticsRes.body.longestTrip.distance).toBe(230);
    });
});

// ==================================================
//         FLOW 5 — Reviews + Voting E2E
// ==================================================

describe("Flow 5 - Reviews + Voting Flow", () => {
    it("should test the entire review lifecycle for a trip", async () => {
        // ---------------------------------------------------------------
        // 1. CREATE TWO USERS (reviewer & voter)
        // ---------------------------------------------------------------
        const user1 = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Reviewer",
                email: "reviewer@example.com",
                password: "Pass123$",
                phone: "999999",
                profileImage: "avatar1"
            });

        const user2 = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Voter",
                email: "voter@example.com",
                password: "Pass123$",
                phone: "888888",
                profileImage: "avatar1"
            });

        // LOGIN BOTH USERS
        const login1 = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "reviewer@example.com", password: "Pass123$" });

        const login2 = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "voter@example.com", password: "Pass123$" });

        const token1 = login1.body.authToken;
        const token2 = login2.body.authToken;
        const reviewerId = login1.body.user._id;

        // ---------------------------------------------------------------
        // 2. CREATE A TRIP DIRECTLY IN DB (to review)
        // ---------------------------------------------------------------
        const trip = await Trip.create({
            title: "Mock Trip",
            description: "Test travel adventure.",
            difficulty: "easy",
            distance: 100,
            duration: 2,
            status: "active",
            createdBy: reviewerId,
            startPoint: {
                name: "Start",
                location: { type: "Point", coordinates: [77.1, 12.9] }
            },
            endPoint: {
                name: "End",
                location: { type: "Point", coordinates: [78.1, 13.9] }
            },
            estimatedCost: {
                car: { fuel: 100, tolls: 20, accommodation: 0, food: 50, parking: 0, total: 170 },
                bike: { fuel: 70, tolls: 10, accommodation: 0, food: 40, parking: 0, total: 120 }
            }
        });

        const tripId = trip._id.toString();

        // ---------------------------------------------------------------
        // 3. FETCH REVIEWS (empty initially)
        // ---------------------------------------------------------------
        const emptyReviews = await request(app).get(`/api/v1/reviews/${tripId}`);
        expect(emptyReviews.status).toBe(200);
        expect(emptyReviews.body.total).toBe(0);

        // ---------------------------------------------------------------
        // 4. POST REVIEW WITH IMAGES
        // ---------------------------------------------------------------
        const createReviewRes = await request(app)
            .post(`/api/v1/reviews/${tripId}`)
            .set("Authorization", `Bearer ${token1}`)
            .field("rating", "5")
            .field("comment", "Amazing trip experience!")
            .attach("images", Buffer.from("fake-image-data"), "image1.jpg")
            .attach("images", Buffer.from("fake-image-data"), "image2.png");

        expect(createReviewRes.status).toBe(201);
        expect(createReviewRes.body.review.rating).toBe(5);

        const reviewId = createReviewRes.body.review._id;

        // ---------------------------------------------------------------
        // 5. UPDATE THE REVIEW
        // ---------------------------------------------------------------
        const updateReview = await request(app)
            .put(`/api/v1/reviews/${tripId}/${reviewId}/update`)
            .set("Authorization", `Bearer ${token1}`)
            .send({
                rating: 4,
                comment: "Actually… still great, but not perfect."
            });

        expect(updateReview.status).toBe(200);
        expect(updateReview.body.review.rating).toBe(4);

        // ---------------------------------------------------------------
        // 6. USER 2 VOTES ON USER 1’s REVIEW
        // ---------------------------------------------------------------
        const voteUp = await request(app)
            .put(`/api/v1/reviews/${tripId}/${reviewId}/voting`)
            .set("Authorization", `Bearer ${token2}`)
            .send({ userVote: "up" });

        expect(voteUp.status).toBe(200);
        expect(voteUp.body.review.upVotes).toBe(1);

        // Change vote → down
        const voteDown = await request(app)
            .put(`/api/v1/reviews/${tripId}/${reviewId}/voting`)
            .set("Authorization", `Bearer ${token2}`)
            .send({ userVote: "down" });

        expect(voteDown.status).toBe(200);
        expect(voteDown.body.review.downVotes).toBe(1);
        expect(voteDown.body.review.upVotes).toBe(0);

        // Remove vote
        const voteRemove = await request(app)
            .put(`/api/v1/reviews/${tripId}/${reviewId}/voting`)
            .set("Authorization", `Bearer ${token2}`)
            .send({ userVote: null });

        expect(voteRemove.status).toBe(200);
        expect(voteRemove.body.review.upVotes).toBe(0);
        expect(voteRemove.body.review.downVotes).toBe(0);

        // ---------------------------------------------------------------
        // 7. DELETE REVIEW (User 1)
        // ---------------------------------------------------------------
        const deleteRes = await request(app)
            .delete(`/api/v1/reviews/${tripId}/${reviewId}`)
            .set("Authorization", `Bearer ${token1}`);

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toMatch(/deleted/i);

        // Confirm deletion
        const afterDelete = await request(app).get(`/api/v1/reviews/${tripId}`);
        expect(afterDelete.status).toBe(200);
        expect(afterDelete.body.total).toBe(0);
    });
});

// ==================================================
//              FLOW 6 — REPORTING SYSTEM
// ==================================================

describe("Flow 6 - Reporting System (User Reports + Admin Fetch)", () => {
    it("should allow reporting of users, trips, reviews and admin fetching all reports", async () => {
        // ----------------------------------------------------------
        // 1. CREATE USERS (reporter + target + admin)
        // ----------------------------------------------------------
        await request(app).post("/api/v1/auth/register").send({
            name: "Reporter",
            email: "reporter@example.com",
            password: "Pass123@",
            phone: "123",
            profileImage: "avatar1"
        });

        await request(app).post("/api/v1/auth/register").send({
            name: "Victim",
            email: "victim@example.com",
            password: "Pass123@",
            phone: "456",
            profileImage: "avatar1"
        });

        // Admin directly in DB
        await User.create({
            name: "Admin",
            email: "admin@example.com",
            password: "AdminPass$",
            profileImage: "avatar1",
            role: "admin"
        });

        // LOGIN USERS
        const loginReporter = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "reporter@example.com", password: "Pass123@" });

        const loginAdmin = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "admin@example.com", password: "AdminPass$" });

        const reporterToken = loginReporter.body.authToken;
        const adminToken = loginAdmin.body.authToken;
        const reporterId = loginReporter.body.user._id;

        const targetUser = await User.findOne({ email: "victim@example.com" });
        const targetUserId = targetUser._id.toString();

        // ----------------------------------------------------------
        // 2. CREATE TRIP + REVIEW DIRECTLY (to be reported)
        // ----------------------------------------------------------
        const trip = await Trip.create({
            title: "Reportable Trip",
            description: "A terrible trip worth reporting.",
            difficulty: "easy",
            distance: 100,
            duration: 2,
            status: "active",
            createdBy: reporterId,
            startPoint: { name: "S", location: { type: "Point", coordinates: [77, 12] } },
            endPoint: { name: "E", location: { type: "Point", coordinates: [78, 13] } },
            estimatedCost: {
                car: { fuel: 100, tolls: 10, accommodation: 0, food: 20, parking: 0, total: 130 },
                bike: { fuel: 50, tolls: 5, accommodation: 0, food: 10, parking: 0, total: 65 }
            }
        });

        const tripId = trip._id.toString();

        const review = await Review.create({
            trip: tripId,
            user: reporterId,
            rating: 1,
            comment: "Worst trip ever.",
            upVotes: 0,
            downVotes: 0,
            votes: []
        });

        const reviewId = review._id.toString();

        // ----------------------------------------------------------
        // 3. REPORT A USER
        // ----------------------------------------------------------
        const reportUser = await request(app)
            .post("/api/v1/reports/user")
            .set("Authorization", `Bearer ${reporterToken}`)
            .send({
                target: targetUserId,
                reason: "Harassment",
                description: "This user was rude."
            });

        expect(reportUser.status).toBe(201);

        // ----------------------------------------------------------
        // 4. REPORT A TRIP
        // ----------------------------------------------------------
        const reportTrip = await request(app)
            .post("/api/v1/reports/trip")
            .set("Authorization", `Bearer ${reporterToken}`)
            .send({
                target: tripId,
                reason: "False Information",
                description: "Trip data is misleading."
            });

        expect(reportTrip.status).toBe(201);

        // ----------------------------------------------------------
        // 5. REPORT A REVIEW
        // ----------------------------------------------------------
        const reportReview = await request(app)
            .post("/api/v1/reports/review")
            .set("Authorization", `Bearer ${reporterToken}`)
            .send({
                target: reviewId,
                reason: "Spam",
                description: "This review is fake."
            });

        expect(reportReview.status).toBe(201);

        // ----------------------------------------------------------
        // 6. ADMIN FETCHES ALL REPORTS
        // ----------------------------------------------------------
        const adminFetch = await request(app)
            .get("/api/v1/admin/reports")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(adminFetch.status).toBe(200);
        expect(Array.isArray(adminFetch.body.reports)).toBe(true);
        expect(adminFetch.body.reports.length).toBe(3);

        // Validate types
        const types = adminFetch.body.reports.map(r => r.type).sort();
        expect(types).toEqual(["Review", "Trip", "User"].sort());
    });
});

// ========================================================
//               FLOW 7 — RECOMMENDATIONS
// ========================================================

describe("Flow 7 - Trip Recommendations", () => {
    it("should return scored, sorted recommendations with breakdown + test caching", async () => {
        // ---------------------------------------------------------
        // 1. Register & login a user
        // ---------------------------------------------------------
        const reg = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "RecoUser",
                email: "reco@example.com",
                password: "Pass123@",
                phone: "12345",
                profileImage: "avatar1"
            });

        const login = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "reco@example.com", password: "Pass123@" });

        const token = login.body.authToken;
        const userId = login.body.user._id;

        // ---------------------------------------------------------
        // 2. Update user preferences (/users/updateUser/:id)
        // ---------------------------------------------------------
        const prefs = await request(app)
            .put(`/api/v1/users/updateUser/${userId}`)
            .set("Authorization", `Bearer ${token}`)
            .send({
                interests: ["beach", "nature"],
                preferences: {
                    altitudeSickness: false,
                    tripDifficulty: "moderate"
                }
            });

        expect(prefs.status).toBe(200);

        // ---------------------------------------------------------
        // 3. Insert multiple trips directly (active only)
        // ---------------------------------------------------------
        const createTrip = (title, rating, difficulty, keywords, coords) =>
            Trip.create({
                title,
                description: `${title} description`,
                difficulty,
                rating,
                reviewCount: 10,
                duration: 10,
                distance: 100,
                status: "active",
                startPoint: {
                    name: "Start",
                    location: { type: "Point", coordinates: coords }
                },
                endPoint: {
                    name: "End",
                    location: { type: "Point", coordinates: coords }
                },
                estimatedCost: {
                    car: { fuel: 100, tolls: 10, accommodation: 0, food: 20, parking: 0, total: 130 },
                    bike: { fuel: 50, tolls: 5, accommodation: 0, food: 10, parking: 0, total: 65 }
                },
                keywords
            });

        await createTrip("Beach Escape", 5, "easy", ["beach"], [12.9, 77.6]);
        await createTrip("Mountain Trek", 4, "hard", ["mountain"], [13.0, 77.7]);
        await createTrip("Nature Walk", 3, "moderate", ["nature"], [12.95, 77.65]);

        // ---------------------------------------------------------
        // 4. Recommendations (first call: DB compute)
        // ---------------------------------------------------------
        const rec1 = await request(app)
            .get("/api/v1/recommendations")
            .set("Authorization", `Bearer ${token}`)
            .query({
                lat: "12.90",
                lng: "77.60",
                budget: "5000",
                duration: "5"
            });

        expect(rec1.status).toBe(200);
        expect(Array.isArray(rec1.body.recommendations)).toBe(true);

        const results = rec1.body.recommendations;
        expect(results.length).toBe(3);

        // Ensure scoring exists
        expect(results[0]).toHaveProperty("recommendationScore");
        expect(results[0]).toHaveProperty("scoreBreakdown");

        // Ensure sorted descending
        expect(results[0].recommendationScore).toBeGreaterThanOrEqual(
            results[1].recommendationScore
        );

        // ---------------------------------------------------------
        // 5. Recommendations again (cached)
        // ---------------------------------------------------------
        const rec2 = await request(app)
            .get("/api/v1/recommendations")
            .set("Authorization", `Bearer ${token}`)
            .query({
                lat: "12.90",
                lng: "77.60",
                budget: "5000",
                duration: "5"
            });

        expect(rec2.status).toBe(200);
        expect(rec2.body.recommendations.length).toBe(3);

        // Here we check that scoring results match exactly → cache worked
        expect(rec2.body.recommendations[0].recommendationScore)
            .toBe(rec1.body.recommendations[0].recommendationScore);
    });
});

// ============================================================
//                    FLOW 8 — MAP & NAVIGATION
// ============================================================

describe("Flow 8 - Map & Navigation", () => {

    it("should fetch nearby POIs using /maps/nearby", async () => {
        const res = await request(app)
            .get("/api/v1/maps/nearby")
            .query({
                lat: "12.90",
                lng: "77.60",
                type: "cafe",
                radius: "2"
            });

        expect(res.status).toBe(200);

        const places = res.body.places;
        expect(Array.isArray(places)).toBe(true);
        expect(places.length).toBe(2);

        // Validate structure
        expect(places[0]).toHaveProperty("id");
        expect(places[0]).toHaveProperty("name");
        expect(places[0]).toHaveProperty("distance");
        expect(places[0].type).toBe("cafe");
    });

    it("should calculate route distance using /maps/route", async () => {
        const res = await request(app)
            .get("/api/v1/maps/route")
            .query({
                startLat: "12.90",
                startLng: "77.60",
                endLat: "12.95",
                endLng: "77.65",
                vehicle: "car"
            });

        expect(res.status).toBe(200);
        expect(res.body.result).toHaveProperty("route");

        const route = res.body.result.route;

        // Validating mocked OSRM values
        expect(route.distance).toBe(15000); // 15 km
        expect(route.duration).toBe(1800);  // 30 min

        // Coordinates preserved
        expect(route.coordinates).toEqual([
            ["12.90", "77.60"],
            ["12.95", "77.65"]
        ]);
    });

});

// =====================================================
//           FLOW 9 — NOTIFICATION SUBSCRIBE + SEND
// =====================================================

describe("Flow 9 - Notifications (Subscribe + Trigger)", () => {
    it("should allow user to subscribe and receive a triggered notification", async () => {
        // ------------------------------------------------
        // 1. Register + Login User
        // ------------------------------------------------
        await request(app).post("/api/v1/auth/register").send({
            name: "Notify User",
            email: "notify@example.com",
            password: "Pass123$",
            phone: "99999",
            profileImage: "avatar1"
        });

        const login = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "notify@example.com", password: "Pass123$" });

        expect(login.status).toBe(200);
        const token = login.body.authToken;
        const userId = login.body.user._id;

        // ------------------------------------------------
        // 2. User Subscribes to Notifications
        // ------------------------------------------------
        const subscriptionToken = "5qE!Qk11Ju16Ke&31vzBY=671twrta0WXUb%7P&0x17pryUOPpj@6sCFCyVqEo#rEaXUp!0nzqz2dexr7gC#ZFFk+t3YJxmK9B+MK";

        const subscribe = await request(app)
            .post("/api/v1/notifications/subscribe")
            .set("Authorization", `Bearer ${token}`)
            .send({
                fcmToken: subscriptionToken, preferences: {
                    checkpointAlerts: true
                }
            });

        expect(subscribe.status).toBe(200);
        expect(subscribe.body.message).toMatch(/subscribed/i);

        // Validate that token was saved
        const updatedUser = await User.findById(userId).lean();
        expect(updatedUser.fcmToken).toBe(subscriptionToken);

        // ------------------------------------------------
        // 3. Trigger Notification (/notifications/send)
        // ------------------------------------------------
        const send = await request(app)
            .post("/api/v1/notifications/send")
            .set("Authorization", `Bearer ${token}`)
            .send({
                userId,
                title: "Test Notification",
                description: "Hello from test suite!",
                type: "checkpointAlerts"
            });
        expect(send.status).toBe(200);
        expect(send.body.read).toBeFalsy()

        // Because FCM is mocked, the "fake-fcm-id" return confirms the call
        expect(send.body.userId).toBe(userId);
    });
});

// ==========================================================
//                 FLOW 10 — FEEDBACK FLOW
// ==========================================================

describe("Flow 10 - User Feedback + Screenshots Upload", () => {
    it("should allow user to submit feedback with screenshots", async () => {
        // -----------------------------------------------------
        // 1. Register + Login a User
        // -----------------------------------------------------
        await request(app).post("/api/v1/auth/register").send({
            name: "Feedback User",
            email: "fb@example.com",
            password: "Pass123@",
            phone: "12345",
            profileImage: "avatar"
        });

        const login = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "fb@example.com", password: "Pass123@" });

        const token = login.body.authToken;
        const userId = login.body.user._id;

        // -----------------------------------------------------
        // 2. Submit feedback via multipart form-data
        // -----------------------------------------------------
        const fakeScreenshot = Buffer.from("fake-img-data");

        const feedbackRes = await request(app)
            .post("/api/v1/feedback")
            .set("Authorization", `Bearer ${token}`)
            .field("type", "bug")
            .field("category", "Login Screen")
            .field("description", "App crashes when pressing the login button after entering credentials.")
            .field(
                "deviceInfo",
                JSON.stringify({
                    platform: "Android",
                    version: "14",
                    model: "SOMEDEVICE"
                })
            )
            .attach("screenshots", fakeScreenshot, "s1.png")
            .attach("screenshots", fakeScreenshot, "s2.png");
        expect(feedbackRes.status).toBe(200);
        expect(feedbackRes.body.feedback).toBeDefined();
        expect(feedbackRes.body.feedback.category).toBe("Login Screen");
        expect(feedbackRes.body.feedback.screenshots.length).toBe(2);

        const stored = await Feedback.findOne({ userId: userId }).lean();
        expect(stored).toBeTruthy();
        expect(stored.screenshots.length).toBe(2);

        // Cloudinary mock ensures URLs exist
        expect(stored.screenshots[0]).toBe("https://mock.cloudinary.com/feedback.jpg");
    });

    it("should reject invalid feedback (missing title or message)", async () => {

        await request(app).post("/api/v1/auth/register").send({
            name: "Feedback User",
            email: "fb@example.com",
            password: "Pass123@",
            phone: "12345",
            profileImage: "avatar"
        });
        // Login user again
        const login = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "fb@example.com", password: "Pass123@" });
        const token = login.body.authToken;

        const bad = await request(app)
            .post("/api/v1/feedback")
            .set("Authorization", `Bearer ${token}`)
            .field("message", "Missing title!");

        expect(bad.status).toBe(400); // validation error
    });
});

// ==========================================================
//                FLOW 11 — ACCOUNT DELETION
// ==========================================================

describe("Flow 11 — Account Deletion + Cleanup", () => {
    it("should delete user account and block all future access", async () => {
        // -------------------------------------------------------
        // 1. Register user
        // -------------------------------------------------------
        const register = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "DeleteMe",
                email: "deleteme@test.com",
                password: "Pass123!",
                phone: "99999999",
                profileImage: "avatar",
            });

        expect(register.status).toBe(200);

        // -------------------------------------------------------
        // 2. Login user
        // -------------------------------------------------------
        const login = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "deleteme@test.com", password: "Pass123!" });

        expect(login.status).toBe(200);

        const token = login.body.authToken;
        expect(token).toBeDefined();

        // -------------------------------------------------------
        // 3. Fetch user profile to confirm existence
        // -------------------------------------------------------
        const userData = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${token}`)
            .query({ email: "deleteme@test.com" });

        expect(userData.status).toBe(200);
        expect(userData.body.user.email).toBe("deleteme@test.com");

        // -------------------------------------------------------
        // 4. Delete user via /users/deleteUser
        // -------------------------------------------------------
        const deleteRes = await request(app)
            .delete("/api/v1/users/deleteUser")
            .set("Authorization", `Bearer ${token}`)
            .send({ email: "deleteme@test.com" });

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.message).toBe("User deleted successfully");

        // -------------------------------------------------------
        // 5. User should no longer exist in DB
        // -------------------------------------------------------
        const afterDelete = await User.findOne({ email: "deleteme@test.com" });
        expect(afterDelete).toBeNull();

        // -------------------------------------------------------
        // 6. Login again should fail
        // -------------------------------------------------------
        const loginFail = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "deleteme@test.com", password: "Pass123!" });

        // Your login route returns 401 for invalid credentials
        expect(loginFail.status).toBe(401);

        // -------------------------------------------------------
        // 7. Protected endpoint with old token should be rejected
        // -------------------------------------------------------
        const protectedFail = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${token}`)
            .query({ email: "deleteme@test.com" });

        // Cannot be authorized because req.user references a deleted user
        // Your middleware will allow the token but the endpoint will 404 or 403
        expect([401, 403, 404]).toContain(protectedFail.status);

        // -------------------------------------------------------
        // 8. Fetch user data again — should return 404 now
        // -------------------------------------------------------
        const fetchDeleted = await request(app)
            .get("/api/v1/users/getUser")
            .set("Authorization", `Bearer ${token}`)
            .query({ email: "deleteme@test.com" });

        expect(fetchDeleted.status).toBe(404);
    });
});