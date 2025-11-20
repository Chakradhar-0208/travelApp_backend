import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";

vi.mock("../../middlewares/auth.js", () => ({
  default: vi.fn((req, _, next) => {
    req.user = { userId: "user123" };
    next();
  }),
}));

const getCacheMock = vi.fn();
const setCacheMock = vi.fn();

vi.mock("../../utils/recommendationCache.js", () => ({
  getCache: (...args) => getCacheMock(...args),
  setCache: (...args) => setCacheMock(...args),
}));

vi.mock("../../models/User.js", () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock("../../models/Trip.js", () => ({
  default: {
    find: vi.fn(),
  },
}));

import User from "../../models/User.js";
import Trip from "../../models/Trip.js";

beforeEach(() => vi.clearAllMocks());

// ---------------------- GET /api/v1/recommendations ---------------------- //

describe("GET /api/v1/recommendations", () => {
  test("should return cached data if cache exists", async () => {
    const cachedValue = [{ name: "Cached Trip" }];
    getCacheMock.mockReturnValueOnce(cachedValue);

    const res = await request(app)
      .get("/api/v1/recommendations?lat=10&lng=20&budget=1000&duration=3");

    expect(res.statusCode).toBe(200);
    expect(res.body.recommendations).toEqual(cachedValue);
    expect(User.findById).not.toHaveBeenCalled();
  });

  test("should return 404 if user not found", async () => {
    getCacheMock.mockReturnValueOnce(null);
    User.findById.mockReturnValueOnce({ lean: () => null });

    const res = await request(app)
      .get("/api/v1/recommendations?lat=10&lng=20&budget=1000&duration=3");

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  test("should return recommendations on cache miss", async () => {
    getCacheMock.mockReturnValueOnce(null);

    User.findById.mockReturnValueOnce({
      lean: () => ({
        preferences: { tripDifficulty: "easy" },
        interests: ["nature"],
      }),
    });

    Trip.find.mockReturnValueOnce({
      lean: () => [
        {
          _id: "t1",
          description: "A nature adventure",
          keywords: ["Nature"],
          difficulty: "easy",
          altitudeSickness: false,
          startPoint: { location: { coordinates: [20, 10] } },
          estimatedCost: { car: { total: 500 } },
          duration: 3,
          rating: 4,
          status: "active",
        },
      ],
    });

    const res = await request(app)
      .get("/api/v1/recommendations?lat=10&lng=20&budget=1000&duration=3");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations[0]).toHaveProperty(
      "recommendationScore"
    );
    expect(setCacheMock).toHaveBeenCalled();
  });

  test("should return 500 on server error", async () => {
    getCacheMock.mockReturnValueOnce(null);

    User.findById.mockImplementationOnce(() => {
      throw new Error("DB failure");
    });

    const res = await request(app)
      .get("/api/v1/recommendations?lat=10&lng=20&budget=1000&duration=3");

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Failed to fetch recommendations");
  });
});
