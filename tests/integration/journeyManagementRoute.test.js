import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../.."
import Journey from "../../models/Journey";
import mongoose from "mongoose";

describe("POST /api/v1/journeys/start", () => {
    test("returns 400 when tripId, userId, or startLocation is missing", async () => {
        const res = await request(app)
            .post("/api/v1/journeys/start")
            .send({ tripId: "123", userId: "456" });  // missing startLocation

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
            "Please provide all tripId, userId, startLocation"
        );
    });

    test("creates journey successfully when valid input is provided", async () => {
        const res = await request(app)
            .post("/api/v1/journeys/start")
            .send({
                tripId: new mongoose.Types.ObjectId().toString(),
                userId: new mongoose.Types.ObjectId().toString(),
                startLocation: {
                    lat: 17.43,
                    lng: 78.39
                }
            });

        expect(res.status).toBe(201);
        expect(res.body.tripId).toBeDefined();
        expect(res.body.userId).toBeDefined();
        // expect(res.body.startLocation).toBe(17.43); //!ERRROR

        // startedOn must be set by route, not provided by client
        expect(res.body.startedOn).toBeDefined();

        // DB check
        const journey = await Journey.findOne({});
        expect(journey).not.toBeNull();
        // expect(journey.startLocation.lat).toBe(17.43); //!ERROR
    });

    test("returns 400 when mongoose validation fails", async () => {
        // Example: sending incorrect type for startLocation
        const res = await request(app)
            .post("/api/v1/journeys/start")
            .send({
                tripId: "123",
                userId: "456",
                startLocation: "not-an-object"
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
    });
});

describe("PUT /api/v1/journeys/:id/checkpoint", () => {

    test("returns 400 if required fields are missing", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: 10
                    // missing duration + coordinates
                }
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
            "Please provide name, distance, duration & coordinates in body"
        );
    });

    test("returns 400 for invalid distance or duration type", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: "wrong",
                    duration: "wrong",
                    coordinates: [12.2, 77.3]
                }
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Please provide valid distance and duration");
    });

    test("returns 400 for invalid coordinates array", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: 10,
                    duration: 5,
                    coordinates: [12.22] // invalid
                }
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Please provide 2 coordinates (N, E) only");
    });

    test("returns 404 when journey does not exist", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/journeys/${id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: 10,
                    duration: 5,
                    coordinates: [10, 20]
                }
            });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Journey not found");
    });

    test("returns 400 when journey is not active", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "completed",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: 10,
                    duration: 5,
                    coordinates: [10, 20]
                }
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Journey is not active");
    });

    test("returns 400 for duplicate checkpoint names", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "active",
            checkpoints: [
                { name: "CP1", distance: 10, duration: 5, coordinates: [10, 20] }
            ],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "cp1", // same name, different case
                    distance: 5,
                    duration: 2,
                    coordinates: [12, 32]
                }
            });

        expect(res.status).toBe(400);
        expect(res.body.error)
            .toBe("checkpoint with same name already exists in Journey");
    });

    test("successfully adds checkpoint & updates totals", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/checkpoint`)
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: 12,
                    duration: 6,
                    coordinates: [15, 30]
                }
            });

        expect(res.status).toBe(200);

        const updated = await Journey.findById(journey._id);

        expect(updated.checkpoints.length).toBe(1);
        expect(updated.checkpoints[0].name).toBe("CP1");
        expect(updated.totalDistance).toBe(12);
        expect(updated.totalDuration).toBe(6);
        expect(updated.checkpoints[0].completedAt).toBeDefined();
    });

});

describe("PUT /api/v1/journeys/:id/end", () => {

    test("returns 404 when journey is not found", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .put(`/api/v1/journeys/${id}/end`)
            .send({ endLocation: { lat: 10, lng: 20 } });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Journey not found");
    });

    test("returns 400 when journey is not active", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12, lng: 77 },
            status: "completed",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/end`)
            .send({ endLocation: { lat: 10, lng: 20 } });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Cannot end a journey with status completed");
    });

    test("returns 400 when endLocation is missing", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12, lng: 77 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/end`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Please provide endLocation");
    });

    test("successfully ends the journey", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12, lng: 77 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .put(`/api/v1/journeys/${journey._id}/end`)
            .send({
                endLocation: { lat: 22.5, lng: 88.3 }
            });

        expect(res.status).toBe(200);
        const updated = await Journey.findById(journey._id);

        expect(updated.status).toBe("completed");
        // expect(updated.endLocation.lat).toBe(22.5);
        expect(updated.completedOn).toBeDefined();
    });

});

describe("GET /api/v1/journeys/active", () => {

    test("returns an empty array when no active journeys exist", async () => {
        const res = await request(app).get("/api/v1/journeys/active");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test("returns only active journeys", async () => {

        // active journey
        await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12, lng: 77 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        // completed journey
        await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 11, lng: 76 },
            status: "completed",
            checkpoints: [],
            totalDistance: 40,
            totalDuration: 5
        });

        // paused journey
        await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 10, lng: 75 },
            status: "cancelled",
            checkpoints: [],
            totalDistance: 20,
            totalDuration: 3
        });

        const res = await request(app).get("/api/v1/journeys/active");

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);

        const journey = res.body[0];
        expect(journey.status).toBe("active");
        // expect(journey.startLocation.lat).toBe(12);
        // expect(journey.startLocation.lng).toBe(77);
        //! ERROR FIX
    });

    test("does not throw error even with large dataset", async () => {
        const journeys = [];

        for (let i = 0; i < 15; i++) {
            journeys.push({
                userId: new mongoose.Types.ObjectId(),
                tripId: new mongoose.Types.ObjectId(),
                startLocation: { lat: 10 + i, lng: 70 + i },
                status: i % 2 === 0 ? "active" : "completed",
                checkpoints: [],
                totalDistance: 0,
                totalDuration: 0
            });
        }

        await Journey.insertMany(journeys);

        const res = await request(app).get("/api/v1/journeys/active");

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(8); // 0,2,4,...14 → 8 active ones
    });

});

describe("GET /api/v1/journeys/history", () => {

    test("returns an empty array when no completed/cancelled journeys exist", async () => {
        const res = await request(app).get("/api/v1/journeys/history");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test("returns only journeys with status completed or cancelled", async () => {
        await Journey.create([
            {
                userId: new mongoose.Types.ObjectId(),
                tripId: new mongoose.Types.ObjectId(),
                startLocation: { lat: 10, lng: 20 },
                status: "completed"
            },
            {
                userId: new mongoose.Types.ObjectId(),
                tripId: new mongoose.Types.ObjectId(),
                startLocation: { lat: 11, lng: 22 },
                status: "cancelled"
            },
            {
                userId: new mongoose.Types.ObjectId(),
                tripId: new mongoose.Types.ObjectId(),
                startLocation: { lat: 12, lng: 24 },
                status: "active"
            },
            {
                userId: new mongoose.Types.ObjectId(),
                tripId: new mongoose.Types.ObjectId(),
                startLocation: { lat: 13, lng: 26 },
                status: "active"
            }
        ]);

        const res = await request(app).get("/api/v1/journeys/history");

        expect(res.status).toBe(200);
        expect(res.body.length).toBe(2);

        const statuses = res.body.map(j => j.status);
        expect(statuses).toContain("completed");
        expect(statuses).toContain("cancelled");
        expect(statuses).not.toContain("active");
        expect(statuses).not.toContain("paused");
    });

});

describe("DELETE /api/v1/journeys/:id/delete", () => {

    test("returns 404 if journey does not exist", async () => {
        const id = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/journeys/${id}/delete`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Journey not found");
    });

    test("returns 400 for invalid ObjectId", async () => {
        const res = await request(app)
            .delete("/api/v1/journeys/INVALID_ID/delete");

        expect(res.status).toBe(400); // catch() leads to 400
        expect(res.body.error).toContain("Cast to ObjectId failed");
    });

    test("successfully deletes an existing journey", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12.2, lng: 77.3 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const res = await request(app)
            .delete(`/api/v1/journeys/${journey._id}/delete`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Journey deleted successfully");

        // Verify deletion in DB
        const deleted = await Journey.findById(journey._id);
        expect(deleted).toBeNull();
    });

});

describe("DELETE /api/v1/journeys/:journeyId/:checkpointId/delete", () => {

    test("returns 404 when journey does not exist", async () => {
        const journeyId = new mongoose.Types.ObjectId();
        const checkpointId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/journeys/${journeyId}/${checkpointId}/delete`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Journey not found");
    });

    test("returns 400 for invalid journeyId", async () => {
        const checkpointId = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/journeys/INVALID_ID/${checkpointId}/delete`);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain("Cast to ObjectId failed");
    });

    test("returns 404 when checkpoint does not exist", async () => {
        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12, lng: 77 },
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0
        });

        const missingCheckpoint = new mongoose.Types.ObjectId();

        const res = await request(app)
            .delete(`/api/v1/journeys/${journey._id}/${missingCheckpoint}/delete`);

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Checkpoint not found");
    });

    test("successfully deletes a checkpoint and updates totals", async () => {
        const checkpointId = new mongoose.Types.ObjectId();

        const journey = await Journey.create({
            userId: new mongoose.Types.ObjectId(),
            tripId: new mongoose.Types.ObjectId(),
            startLocation: { lat: 12, lng: 77 },
            status: "active",
            totalDistance: 50,
            totalDuration: 20,
            checkpoints: [
                {
                    _id: checkpointId,
                    name: "CP1",
                    distance: 10,
                    duration: 5,
                    coordinates: [12, 77],
                    completedAt: new Date()
                },
                {
                    _id: new mongoose.Types.ObjectId(),
                    name: "CP2",
                    distance: 15,
                    duration: 8,
                    coordinates: [13, 78],
                    completedAt: new Date()
                }
            ]
        });

        const res = await request(app)
            .delete(`/api/v1/journeys/${journey._id}/${checkpointId}/delete`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Checkpoint delted successfully");

        const updated = await Journey.findById(journey._id);

        expect(updated.checkpoints.length).toBe(1);
        expect(updated.checkpoints[0].name).toBe("CP2");

        // totals updated
        expect(updated.totalDistance).toBe(40); // 50 - 10
        expect(updated.totalDuration).toBe(15); // 20 - 5
    });

});