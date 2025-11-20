import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";
import Journey from "../../models/Journey.js";

const saveMock = vi.fn();

vi.mock("../../models/Journey.js", () => {
    function Journey(data) {
        Object.assign(this, data);
        this.save = saveMock;
    }

    Journey.find = vi.fn();
    Journey.findById = vi.fn();
    Journey.findByIdAndDelete = vi.fn();

    return { default: Journey };
});

beforeEach(() => vi.clearAllMocks());

// ---------------------- GET /api/v1/journeys/ ---------------------- //

describe("GET /api/v1/journeys/", () => {
    test("should return OK", async () => {
        const res = await request(app).get("/api/v1/journeys/");
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe("Journey Management Route Active");
    });
});

// ---------------------- POST /api/v1/journeys/start ---------------------- //

describe("POST /api/v1/journeys/start", () => {
    test("should return 400 for missing fields", async () => {
        const res = await request(app)
            .post("/api/v1/journeys/start")
            .send({ tripId: "t1" });

        expect(res.statusCode).toBe(400);
    });

    test("should create journey", async () => {
        const mockSave = saveMock.mockResolvedValueOnce(true);

        const res = await request(app)
            .post("/api/v1/journeys/start")
            .send({
                tripId: "trip123",
                userId: "user123",
                startLocation: "Hyderabad",
            });

        expect(res.statusCode).toBe(201);
        expect(mockSave).toHaveBeenCalledOnce();
    });

    test("should return 400 if save throws error", async () => {
        saveMock.mockImplementationOnce(() => {
            throw new Error("DB Error");
        });

        const res = await request(app)
            .post("/api/v1/journeys/start")
            .send({
                tripId: "tripX",
                userId: "userX",
                startLocation: "Vijayawada",
            });

        expect(res.statusCode).toBe(400);
    });
});

// ---------------------- PUT /api/v1/journeys/:id/checkpoint ---------------------- //

describe("PUT /api/v1/journeys/:id/checkpoint", () => {
    test("should return 400 for invalid checkpoint body", async () => {
        const res = await request(app)
            .put("/api/v1/journeys/123/checkpoint")
            .send({ checkpoint: { name: "CP1" } });

        expect(res.statusCode).toBe(400);
    });

    test("should return 404 if journey not found", async () => {
        Journey.findById.mockResolvedValueOnce(null);

        const res = await request(app)
            .put("/api/v1/journeys/123/checkpoint")
            .send({
                checkpoint: {
                    name: "Start",
                    distance: 10,
                    duration: 5,
                    coordinates: [1, 2],
                },
            });

        expect(res.statusCode).toBe(404);
    });

    test("should block if journey not active", async () => {
        Journey.findById.mockResolvedValueOnce({
            status: "completed",
        });

        const res = await request(app)
            .put("/api/v1/journeys/123/checkpoint")
            .send({
                checkpoint: {
                    name: "Start",
                    distance: 10,
                    duration: 5,
                    coordinates: [1, 2],
                },
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("not active");
    });

    test("should block duplicate checkpoint names", async () => {
        Journey.findById.mockResolvedValueOnce({
            status: "active",
            checkpoints: [{ name: "start" }],
            totalDistance: 0,
            totalDuration: 0,
            save: saveMock,
        });

        const res = await request(app)
            .put("/api/v1/journeys/123/checkpoint")
            .send({
                checkpoint: {
                    name: "Start",
                    distance: 10,
                    duration: 5,
                    coordinates: [1, 2],
                },
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("already exists");
    });

    test("should add checkpoint", async () => {
        Journey.findById.mockResolvedValueOnce({
            status: "active",
            checkpoints: [],
            totalDistance: 0,
            totalDuration: 0,
            save: saveMock,
        });

        const res = await request(app)
            .put("/api/v1/journeys/123/checkpoint")
            .send({
                checkpoint: {
                    name: "CP1",
                    distance: 5,
                    duration: 3,
                    coordinates: [80, 16],
                },
            });

        expect(res.statusCode).toBe(200);
        expect(saveMock).toHaveBeenCalled();
    });
});

// ---------------------- PUT /api/v1/journeys/:id/end ---------------------- //

describe("PUT /api/v1/journeys/:id/end", () => {
    test("should return 404 if journey not found", async () => {
        Journey.findById.mockResolvedValueOnce(null);

        const res = await request(app)
            .put("/api/v1/journeys/123/end")
            .send({ endLocation: "Vijayawada" });

        expect(res.statusCode).toBe(404);
    });

    test("should block non-active journey", async () => {
        Journey.findById.mockResolvedValueOnce({
            status: "completed",
        });

        const res = await request(app)
            .put("/api/v1/journeys/123/end")
            .send({ endLocation: "Delhi" });

        expect(res.statusCode).toBe(400);
    });

    test("should return 400 if missing endLocation", async () => {
        Journey.findById.mockResolvedValueOnce({
            status: "active",
        });

        const res = await request(app).put("/api/v1/journeys/123/end").send({});

        expect(res.statusCode).toBe(400);
    });

    test("should complete journey", async () => {
        Journey.findById.mockResolvedValueOnce({
            status: "active",
            save: saveMock,
        });

        const res = await request(app)
            .put("/api/v1/journeys/123/end")
            .send({ endLocation: "Hyderabad" });

        expect(res.statusCode).toBe(200);
        expect(saveMock).toHaveBeenCalled();
    });
});

// ---------------------- GET /api/v1/journeys/active ---------------------- //

describe("GET /api/v1/journeys/active", () => {
    test("should return active journeys", async () => {
        Journey.find.mockResolvedValueOnce([{ id: 1 }]);

        const res = await request(app).get("/api/v1/journeys/active");

        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBe(1);
    });
});

// ---------------------- GET /api/v1/journeys/history ---------------------- //

describe("GET /api/v1/journeys/history", () => {
    test("should return completed/cancelled journeys", async () => {
        Journey.find.mockResolvedValueOnce([{ id: 1, status: "completed" }]);

        const res = await request(app).get("/api/v1/journeys/history");

        expect(res.statusCode).toBe(200);
        expect(res.body.length).toBe(1);
    });
});

// ---------------------- DELETE /api/v1/journeys/:id/delete ---------------------- //

describe("DELETE /api/v1/journeys/:id/delete", () => {
    test("should return 404 if no journey found", async () => {
        Journey.findByIdAndDelete.mockResolvedValueOnce(null);

        const res = await request(app).delete("/api/v1/journeys/123/delete");

        expect(res.statusCode).toBe(404);
    });

    test("should delete journey", async () => {
        Journey.findByIdAndDelete.mockResolvedValueOnce({ id: 1 });

        const res = await request(app).delete("/api/v1/journeys/123/delete");

        expect(res.statusCode).toBe(200);
    });
});

// ---------------------- DELETE /api/v1/journeys/:journeyId/:checkpointId/delete ---------------------- //

describe("DELETE /api/v1/journeys/:journeyId/:checkpointId/delete", () => {
    test("should return 404 if journey missing", async () => {
        Journey.findById.mockResolvedValueOnce(null);

        const res = await request(app).delete("/api/v1/journeys/1/1/delete");

        expect(res.statusCode).toBe(404);
    });

    test("should return 404 if checkpoint missing", async () => {
        Journey.findById.mockResolvedValueOnce({
            checkpoints: [],
        });

        const res = await request(app).delete("/api/v1/journeys/1/1/delete");

        expect(res.statusCode).toBe(404);
    });

    test("should remove checkpoint", async () => {
        Journey.findById.mockResolvedValueOnce({
            checkpoints: [{ _id: "c1", id: "c1", distance: 10, duration: 5 }],
            totalDistance: 10,
            totalDuration: 5,
            save: saveMock,
        });

        const res = await request(app).delete("/api/v1/journeys/1/c1/delete");

        expect(res.statusCode).toBe(200);
        expect(saveMock).toHaveBeenCalled();
    });
});
