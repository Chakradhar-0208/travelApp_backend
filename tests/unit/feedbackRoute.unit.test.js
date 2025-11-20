import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";
import Feedback from "../../models/Feedback.js";
import authenticateToken from "../../middlewares/auth.js";
import { uploadToCloudinaryFeedback } from "../../utils/cloudinaryUpload.js";

// ---------------------- MOCKS ---------------------- //

vi.mock("../../middlewares/auth.js", () => ({
  default: vi.fn((req, res, next) => {
    req.user = { userId: "mockUser123" };
    next();
  }),
}));

vi.mock("../../models/Feedback.js", () => {
  const saveMock = vi.fn();

  function MockFeedback(data) {
    Object.assign(this, data);
    this.save = saveMock;
  }

  MockFeedback.prototype.save = saveMock;

  return { default: MockFeedback };
});

vi.mock("../../utils/cloudinaryUpload.js", () => ({
  uploadToCloudinaryFeedback: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------- POST /api/v1/feedback/feedback ---------------------- //

describe("POST /api/v1/feedback/feedback", () => {

  test("should return 400 for invalid type", async () => {
    const res = await request(app)
      .post("/api/v1/feedback/")
      .field("type", "nonsense")
      .field("category", "UI")
      .field("description", "Bad UI")
      .field("deviceInfo", JSON.stringify({ platform: "Android", version: "12", model: "Pixel" }));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid type");
  });

  test("should return 400 if required fields missing", async () => {
    const res = await request(app)
      .post("/api/v1/feedback/")
      .field("type", "bug");

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("All fields are required");
  });

  test("should save feedback without screenshots", async () => {
    const saveSpy = Feedback.prototype.save;

    const res = await request(app)
      .post("/api/v1/feedback/")
      .field("type", "bug")
      .field("category", "Crash Issue")
      .field("description", "App crashes on login")
      .field("deviceInfo", JSON.stringify({
        platform: "Android",
        version: "14",
        model: "OnePlus 9"
      }));
    console.log("MAHHH", res.body)
    expect(res.statusCode).toBe(200);
    expect(res.body.feedback.userId).toBe("mockUser123");
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  test("should upload screenshots and save feedback", async () => {
    uploadToCloudinaryFeedback.mockResolvedValueOnce({
      secure_url: "https://cloudinary.com/fake.png"
    });

    const saveSpy = Feedback.prototype.save;

    const res = await request(app)
      .post("/api/v1/feedback/")
      .field("type", "feature")
      .field("category", "Improvement")
      .field("description", "Add dark mode")
      .field("deviceInfo", JSON.stringify({
        platform: "iOS",
        version: "17",
        model: "iPhone 15"
      }))
      .attach("screenshots", Buffer.from("dummyimage"), "test.png");

    expect(res.statusCode).toBe(200);
    expect(res.body.feedback.userId).toBe("mockUser123");
    expect(uploadToCloudinaryFeedback).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  test("should return 500 on unexpected server error", async () => {
    Feedback.prototype.save.mockImplementationOnce(() => {
      throw new Error("DB fail");
    });

    const res = await request(app)
      .post("/api/v1/feedback/")
      .field("type", "bug")
      .field("category", "Crash")
      .field("description", "App freezes")
      .field("deviceInfo", JSON.stringify({
        platform: "Android",
        version: "11",
        model: "Samsung"
      }));

    expect(res.statusCode).toBe(500);
  });

});
