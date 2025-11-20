import request from "supertest";
import app from "../../index.js";
import { describe, test, expect, vi } from "vitest";
import axios from "axios";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

describe("GET /api/v1/maps/nearby", () => {

  test("returns 400 if required fields missing", async () => {
    const res = await request(app)
      .get("/api/v1/maps/nearby");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("All fields are required");
  });

  test("returns list of places from Overpass", async () => {
    axios.post.mockResolvedValue({
      data: {
        elements: [
          {
            id: 999,
            lat: 17.1,
            lon: 80.3,
            tags: { name: "Mock Cafe", amenity: "cafe" }
          }
        ]
      }
    });

    const res = await request(app)
      .get("/api/v1/maps/nearby?lat=17&lng=80&type=cafe&radius=5");

    expect(res.status).toBe(200);
    expect(res.body.places.length).toBe(1);
    expect(res.body.places[0].name).toBe("Mock Cafe");
  });

  test("returns 500 if Overpass API fails", async () => {
    axios.post.mockRejectedValue(new Error("fail"));

    const res = await request(app)
      .get("/api/v1/maps/nearby?lat=17&lng=80&type=cafe");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server Error");
  });

});

describe("GET /api/v1/maps/route", () => {

  test("returns 400 if missing fields", async () => {
    const res = await request(app)
      .get("/api/v1/maps/route");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Bad Request");
  });

  test("returns route data when OSRM responds", async () => {
    axios.get.mockResolvedValue({
      data: {
        routes: [
          {
            legs: [
              { distance: 15000, duration: 900 }
            ]
          }
        ]
      }
    });

    const res = await request(app)
      .get("/api/v1/maps/route?startLat=17&startLng=80&endLat=18&endLng=81&vehicle=car");

    expect(res.status).toBe(200);

    const route = res.body.result.route;

    expect(route.distance).toBe(15000);
    expect(route.duration).toBe(900);
    expect(route.coordinates).toEqual([
      ["17", "80"],
      ["18", "81"]
    ]);
  });

  test("returns 500 when OSRM fails", async () => {
    axios.get.mockRejectedValue(new Error("nope"));

    const res = await request(app)
      .get("/api/v1/maps/route?startLat=17&startLng=80&endLat=18&endLng=81&vehicle=car");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server Error");
  });

});