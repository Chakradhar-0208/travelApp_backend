import axios from "axios";
import request from "supertest";
import app from "../../index.js";
import { describe, test, expect, vi } from "vitest";


vi.mock("axios", () => ({
    default: {
        post: vi.fn(),
        get: vi.fn()
    }
}));


describe("GET /api/v1/maps/nearby", () => {

    test("returns 400 if required fields missing", async () => {
        const res = await request(app).get("/api/v1/maps/nearby");
        expect(res.status).toBe(400);
        expect(res.body.message).toBe("All fields are required");
    });

    test("returns places from Overpass API", async () => {
        axios.post.mockResolvedValue({
            data: {
                elements: [
                    {
                        id: 123,
                        lat: 17.1,
                        lon: 80.2,
                        tags: { name: "Test Cafe", amenity: "cafe" }
                    },
                    {
                        id: 456,
                        lat: 17.2,
                        lon: 80.3,
                        tags: { name: "Unnamed Spot", amenity: "restaurant" }
                    }
                ]
            }
        });

        const res = await request(app)
            .get("/api/v1/maps/nearby?lat=17&lng=80&type=cafe&radius=5");

        expect(res.status).toBe(200);
        expect(res.body.places.length).toBe(2);
        expect(res.body.places[0].name).toBe("Test Cafe");
        expect(res.body.places[0].type).toBe("cafe");
    });
    test("returns 500 if Overpass API fails", async () => {
        axios.post.mockRejectedValue(new Error("API down"));

        const res = await request(app)
            .get("/api/v1/maps/nearby?lat=17&lng=80&type=cafe");

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Server Error");
    });

});
describe("GET /api/v1/maps/route", () => {

    test("returns 400 when required fields missing", async () => {
        const res = await request(app)
            .get("/api/v1/maps/route?startLat=1");

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Bad Request");
    });
    test("returns route data from OSRM API", async () => {
        axios.get.mockResolvedValue({
            data: {
                routes: [
                    {
                        legs: [
                            {
                                distance: 1000,
                                duration: 200
                            }
                        ]
                    }
                ]
            }
        });

        const res = await request(app)
            .get("/api/v1/maps/route?startLat=17&startLng=80&endLat=18&endLng=81&vehicle=car");

        expect(res.status).toBe(200);
        expect(res.body.result.route.distance).toBe(1000);
        expect(res.body.result.route.duration).toBe(200);
    });
    test("returns 500 if OSRM API fails", async () => {
        axios.get.mockRejectedValue(new Error("OSRM failed"));

        const res = await request(app)
            .get("/api/v1/maps/route?startLat=17&startLng=80&endLat=18&endLng=81&vehicle=car");

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Server Error");
    });

});
