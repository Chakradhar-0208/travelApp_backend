import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";
import User from "../../models/User.js";
import Trip from "../../models/Trip.js";
import Report from "../../models/Report.js";
import mongoose from "mongoose";
import { getCache } from "../../utils/caching/adminCaching.js";

// ---------------------- MOCKS ---------------------- //

vi.mock("../../middlewares/requireRole.js", () => {
  return {
    default: (role) => {
      return (req, res, next) => {
        req.user = { id: "fake-user", role }; // always matches the required role
        next();
      };
    },
  };
});

vi.mock("../../middlewares/auth.js", () => {
  return {
    default: (req, res, next) => {
      req.user = { id: "fake-user" };
      next();
    },
  };
});

vi.mock("../../utils/caching/adminCaching.js", () => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  invalidateAdminCache: vi.fn(),
}));

vi.mock("../../models/User.js", () => ({
  default: {
    find: vi.fn(() => ({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ name: "Mocked User" }]),
    })),
    findById: vi.fn(() => ({
      lean: vi.fn().mockResolvedValue({ name: "Mocked User" }),
    })),
    deleteOne: vi.fn(),
  },
}));

vi.mock("../../models/Trip.js", () => ({
  default: {
    find: vi.fn(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { title: "Mocked Trip", status: "active", createdBy: { name: "Admin" } },
      ]),
    })),
    findById: vi.fn(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { title: "Mocked Trip", status: "active", createdBy: { name: "Admin" } },
      ]),
    })),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
  },
}));

vi.mock("../../models/Report.js", () => ({
  default: {
    find: vi.fn(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { reason: "Spam", reportedBy: { name: "User" } },
      ]),
    })),
  },
}));

vi.mock("mongoose", () => {
  class FakeSchema {
    constructor(def, opts) {
      this.def = def;
      this.opts = opts;
    }
    index() { }
  }
  FakeSchema.Types = { ObjectId: { isValid: vi.fn(() => true) } };

  return {
    default: {
      Schema: FakeSchema,
      model: vi.fn(() => ({})),
      connect: vi.fn(),
      disconnect: vi.fn(),
      connection: { readyState: 1, close: vi.fn() },
      Types: { ObjectId: { isValid: vi.fn(() => true) } },
    },
  };
});

beforeEach(() => vi.clearAllMocks());

// ---------------------- ADMIN ROOT ---------------------- //

describe("GET /api/v1/admin", () => {
  test("should return active message", async () => {
    const res = await request(app).get("/api/v1/admin");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Admin Route Active");
  });
});

// ---------------------- USERS ---------------------- //

describe("GET /api/v1/admin/users", () => {
  test("should return from cache", async () => {
    getCache.mockReturnValueOnce("somedata");
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("cache");
  });

  test("should return from db", async () => {
    getCache.mockReturnValueOnce(null);
    const res = await request(app).get("/api/v1/admin/users");
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("db");
  });
});

describe("GET /api/v1/admin/users/:id", () => {
  test("should return invalid id", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);
    const res = await request(app).get("/api/v1/admin/users/bad");
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid User ID format");
  });

  test("should return cached data", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(true);
    getCache.mockReturnValueOnce("cached");
    const res = await request(app).get("/api/v1/admin/users/good");
    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe("cache");
  });

  test("should return user not found", async () => {
    User.findById.mockImplementationOnce(() => ({
      lean: vi.fn().mockResolvedValue(null),
    }));
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(true);
    getCache.mockReturnValueOnce(null);

    const res = await request(app).get("/api/v1/admin/users/id");
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("User not found");
  });

  test("should return user", async () => {
    getCache.mockReturnValueOnce(false);
    const res = await request(app).get("/api/v1/admin/users/id");
    expect(res.statusCode).toBe(200);
    expect(res.body.user.name).toBe("Mocked User");
  });
});

describe("PUT /api/v1/admin/users/:id", () => {
  test("should return invalid id", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);
    const res = await request(app).put("/api/v1/admin/users/bad");
    expect(res.statusCode).toBe(400);
  });

  test("should return user not found", async () => {
    User.findById.mockReturnValueOnce(false);
    const res = await request(app).put("/api/v1/admin/users/id");
    expect(res.statusCode).toBe(404);
  });

  test("should update user", async () => {
    User.findById.mockResolvedValue({
      name: "Updated User",
      save: vi.fn().mockResolvedValue(true),
    });
    const res = await request(app)
      .put("/api/v1/admin/users/id")
      .send({ status: "active" });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.name).toBe("Updated User");
  });
});

describe("DELETE /api/v1/admin/users/:id", () => {
  test("should return invalid id", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);
    const res = await request(app).delete("/api/v1/admin/users/bad");
    expect(res.statusCode).toBe(400);
  });

  test("should return user not found", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(true);
    User.findById.mockImplementationOnce(() => ({
      lean: vi.fn().mockResolvedValueOnce(null),
    }));
    const res = await request(app).delete("/api/v1/admin/users/id");
    expect(res.statusCode).toBe(404);
  });

  test("should delete user", async () => {
    User.findById.mockImplementationOnce(() => ({
      lean: vi.fn().mockResolvedValue("something"),
    }));
    const res = await request(app).delete("/api/v1/admin/users/id");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");
  });
});

// ---------------------- TRIPS ---------------------- //

describe("GET /api/v1/admin/trips", () => {
  test("should return from cache", async () => {
    getCache.mockReturnValueOnce([{ title: "Cached Trip" }]);
    const res = await request(app).get("/api/v1/admin/trips");
    expect(res.body.source).toBe("cache");
  });

  test("should return from db", async () => {
    getCache.mockReturnValueOnce(null);
    const res = await request(app).get("/api/v1/admin/trips");
    expect(res.body.source).toBe("db");
  });
});

describe("GET /api/v1/admin/trips/inactive", () => {
  test("should return from cache", async () => {
    getCache.mockReturnValueOnce([{ title: "Inactive Trip" }]);
    const res = await request(app).get("/api/v1/admin/trips/inactive");
    expect(res.body.source).toBe("cache");
  });
});

describe("GET /api/v1/admin/trips/:id", () => {
  test("invalid id", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);
    const res = await request(app).get("/api/v1/admin/trips/bad");
    expect(res.statusCode).toBe(400);
  });

  test("cached data", async () => {
    getCache.mockReturnValueOnce({ title: "Cached Trip" });
    const res = await request(app).get("/api/v1/admin/trips/id");
    expect(res.body.source).toBe("cache");
  });

  test("not found", async () => {
    getCache.mockReturnValueOnce(null);
    Trip.findById.mockImplementationOnce(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    }));
    const res = await request(app).get("/api/v1/admin/trips/id");
    expect(res.statusCode).toBe(404);
  });

  test("db trip", async () => {
    getCache.mockReturnValueOnce(false);
    Trip.findById.mockImplementationOnce(() => ({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ title: "Trip 1" }),
    }));
    const res = await request(app).get("/api/v1/admin/trips/id");
    expect(res.body.trip.title).toBe("Trip 1");
  });
});

describe("PUT /api/v1/admin/trips/:id", () => {
  test("invalid id", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);
    const res = await request(app).put("/api/v1/admin/trips/bad");
    expect(res.statusCode).toBe(400);
  });

  test("not found", async () => {
    Trip.findById.mockResolvedValueOnce(null);
    const res = await request(app).put("/api/v1/admin/trips/id");
    expect(res.statusCode).toBe(404);
  });

  test("update", async () => {
    const save = vi.fn().mockResolvedValue(true);
    Trip.findById.mockResolvedValueOnce({ title: "Updated", save });
    const res = await request(app)
      .put("/api/v1/admin/trips/id")
      .send({ title: "Updated" });

    expect(res.body.trip.title).toBe("Updated");
  });
});

describe("DELETE /api/v1/admin/trips/:id", () => {
  test("invalid id", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);
    const res = await request(app).delete("/api/v1/admin/trips/bad");
    expect(res.statusCode).toBe(400);
  });

  test("not found", async () => {
    Trip.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValueOnce(null),
    });
    const res = await request(app).delete("/api/v1/admin/trips/id");
    expect(res.statusCode).toBe(404);
  });

  test("delete", async () => {
    Trip.findById.mockImplementationOnce(() => ({
      lean: vi.fn().mockResolvedValue("something"),
    }));
    const res = await request(app).delete("/api/v1/admin/trips/id");
    expect(res.body.message).toBe("Trip deleted successfully");
  });
});

// ---------------------- REPORTS ---------------------- //

describe("GET /api/v1/admin/reports", () => {
  test("cache", async () => {
    getCache.mockReturnValueOnce([{ reason: "Spam" }]);
    const res = await request(app).get("/api/v1/admin/reports");
    expect(res.body.source).toBe("cache");
  });

  test("db", async () => {
    getCache.mockReturnValueOnce(null);
    const res = await request(app).get("/api/v1/admin/reports");
    expect(res.body.source).toBe("db");
  });
});
