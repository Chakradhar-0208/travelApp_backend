import request from "supertest";
import { describe, test, expect, beforeEach, vi } from "vitest";
import app from "../../index.js";

vi.mock("../../middlewares/auth.js", () => ({
  default: (req, res, next) => {
    req.user = { userId: "mockUser" };
    next();
  },
}));

vi.mock("../../utils/caching/tripCache.js", () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  invalidateTripCache: vi.fn(),
}));

vi.mock("../../middlewares/multer.js", () => ({
  __esModule: true,
  default: {
    single: () => (req, res, next) => {
      req.file = null;
      next();
    },
    array: () => (req, res, next) => {
      req.files = [];
      next();
    },
  },
}));

vi.mock("../../config/cloudinary.js", () => ({
  default: {
    api: {
      delete_resources_by_prefix: vi.fn().mockResolvedValue(true),
    },
  },
}));

vi.mock("../../utils/cloudinaryUpload.js", () => ({
  uploadToCloudinary: vi.fn().mockResolvedValue({
    secure_url: "mock_url",
  }),
}));

vi.mock("../../models/Trip.js", () => {
  const Trip = vi.fn(function (data) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(this);
  });

  Trip.find = vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([{ title: "Trip 1" }]),
  }));

  Trip.countDocuments = vi.fn().mockResolvedValue(1);

  Trip.findById = vi.fn(() => ({
    select: vi.fn()
  }));

  return { default: Trip };
});

vi.mock("../../models/User.js", () => {
  const User = {
    findById: vi.fn(),
    updateOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  };
  User.findById = vi.fn(() => ({
    select: vi.fn()
  }));
  return { default: User };
});

import Trip from "../../models/Trip.js";
import User from "../../models/User.js";
import { getCache } from "../../utils/caching/tripCache.js";

beforeEach(() => {
  vi.clearAllMocks();
});


// ----------------------------
// GET /api/v1/trips
// ----------------------------
describe("GET /api/v1/trips", () => {
  test("should return cached data", async () => {
    getCache.mockReturnValueOnce({ data: [], source: "cache" });

    const res = await request(app).get("/api/v1/trips");

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("cache");
  });

  test("should return DB data when cache empty", async () => {
    getCache.mockReturnValueOnce(null);

    const res = await request(app).get("/api/v1/trips");

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("db");
    expect(res.body.data.length).toBe(1);
  });
});


// ----------------------------
// GET /api/v1/trips/:id
// ----------------------------
describe("GET /api/v1/trips/:id", () => {
  test("should return data from DB", async () => {
    getCache.mockReturnValueOnce(null);

    Trip.findById.mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ title: "Mock Trip" }),
    });

    const res = await request(app).get("/api/v1/trips/123");

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("db");
  });

  test("should return 404 if trip not found", async () => {
    getCache.mockReturnValueOnce(null);

    Trip.findById.mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    const res = await request(app).get("/api/v1/trips/123");

    expect(res.status).toBe(404);
  });
});


// ----------------------------
// POST /api/v1/trips/:id/save
// ----------------------------
describe("POST /api/v1/trips/:id/save", () => {
  test("should return 404 if trip not found", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue(null)
    });

    const res = await request(app).post("/api/v1/trips/123/save");
    expect(res.status).toBe(404);
  });

  test("should return 404 if user not found", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ _id: 123 })
    });

    User.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue(null)
    });

    const res = await request(app).post("/api/v1/trips/123/save");
    expect(res.status).toBe(404);
  });

  test("should return 400 if already saved", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ _id: "123" })
    });

    User.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ savedTrips: ["123"] })
    });

    const res = await request(app).post("/api/v1/trips/123/save");
    expect(res.status).toBe(400);
  });

  test("should save trip", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ _id: 123 })
    });

    User.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ savedTrips: [] })
    });

    User.updateOne.mockResolvedValueOnce(true);

    const res = await request(app).post("/api/v1/trips/123/save");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Trip saved successfully");
  });
});


// ----------------------------
// POST /api/v1/trips
// ----------------------------
describe("POST /api/v1/trips", () => {
  test("should create a trip", async () => {
    const res = await request(app)
      .post("/api/v1/trips")
      .send({ title: "Trip X" });

    expect(res.status).toBe(201);
  });
});


// ----------------------------
// PUT /api/v1/trips/:id
// ----------------------------
describe("PUT /api/v1/trips/:id", () => {
  test("should return 404 if trip not found", async () => {
    Trip.findById.mockResolvedValueOnce(null);

    const res = await request(app)
      .put("/api/v1/trips/999")
      .send({ title: "Updated" });

    expect(res.status).toBe(404);
  });

  test("should return 403 if unauthorized", async () => {
    Trip.findById.mockResolvedValueOnce({
      createdBy: "anotherUser",
    });

    const res = await request(app)
      .put("/api/v1/trips/123")
      .send({ title: "Updated" });

    expect(res.status).toBe(403);
  });

  test("should update successfully", async () => {
    Trip.findById.mockResolvedValueOnce({
      createdBy: "mockUser",
      save: vi.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .put("/api/v1/trips/123")
      .send({ title: "Updated Trip" });

    expect(res.status).toBe(200);
  });
});


// ----------------------------
// DELETE /api/v1/trips/:id
// ----------------------------
describe("DELETE /api/v1/trips/:id", () => {
  test("should return 404 if trip not found", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce(null)
    });

    const res = await request(app).delete("/api/v1/trips/123");
    expect(res.status).toBe(404);
  });

  test("should return 403 if unauthorized", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce({
        status: "active",
        createdBy: "anotherUser",
      }),
    });

    const res = await request(app).delete("/api/v1/trips/123");
    expect(res.status).toBe(403);
  });

  test("should delete successfully", async () => {
    Trip.findById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce({
        status: "active",
        createdBy: "mockUser",
        deleteOne: vi.fn().mockResolvedValueOnce(true)
      }),
    });

    const res = await request(app).delete("/api/v1/trips/123");

    expect(res.status).toBe(200);
  });
});
