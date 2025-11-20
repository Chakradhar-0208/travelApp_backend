import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import app from "../../index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import User from "../../models/User.js";


vi.mock("bcryptjs");
vi.mock("jsonwebtoken");
vi.mock("axios");
const saveMock = vi.fn();

vi.mock("../../models/User.js", () => {
    function MockUser(data) {
        Object.assign(this, data);
        this.save = saveMock;
    }

    MockUser.findOne = vi.fn();
    MockUser.findById = vi.fn();

    return { default: MockUser };
});

process.env.JWT_SECRET = "supersecret";

beforeEach(() => {
    vi.clearAllMocks();
});


describe("POST /api/v1/auth/login", () => {
    test("should return 400 if email or password missing", async () => {
        const res = await request(app).post("/api/v1/auth/login").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Email and password are required.");
    });

    test("should return 401 if user not found", async () => {
        User.findOne.mockResolvedValueOnce(null);
        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "no@user.com", password: "123" });
        expect(res.statusCode).toBe(401);
        expect(res.body.message).toBe("Invalid email or password.");
    });

    test("should return 401 if password mismatch", async () => {
        User.findOne.mockResolvedValueOnce({ email: "a@b.com", password: "$2hash" });
        bcrypt.compare.mockResolvedValueOnce(false);
        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "a@b.com", password: "wrong" });
        expect(res.statusCode).toBe(401);
    });

    test("should return 200 with JWT if password matches", async () => {
        const mockUser = {
            _id: "user123",
            email: "a@b.com",
            name: "Alice",
            phone: "999",
            profileImage: "img",
            role: "user",
            password: "$2hash",
            save: vi.fn(),
        };
        User.findOne.mockResolvedValueOnce(mockUser);
        bcrypt.compare.mockResolvedValueOnce(true);
        jwt.sign.mockReturnValueOnce("mockedtoken");

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "a@b.com", password: "123" });

        expect(res.statusCode).toBe(200);
        expect(res.body.authToken).toBe("mockedtoken");
        expect(res.body.user.email).toBe("a@b.com");
    });
});


describe("POST /api/v1/auth/register", () => {
    test("should return 400 if fields missing", async () => {
        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({ email: "test@test.com" });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Required fields missing.");
    });

    test("should return 400 if user already exists", async () => {
        User.findOne.mockResolvedValueOnce({ email: "exists@test.com" });
        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Test",
                email: "exists@test.com",
                password: "123",
                phone: "123",
                profileImage: "img",
            });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("User already exists.");
    });

    test("should register new user and return token", async () => {
        User.findOne.mockResolvedValueOnce(null);
        bcrypt.genSalt.mockResolvedValueOnce("salt");
        bcrypt.hash.mockResolvedValueOnce("hashed");
        jwt.sign.mockReturnValueOnce("token");
        const mockSave = vi.fn().mockResolvedValue(true);
        User.prototype.save = mockSave;

        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "NewUser",
                email: "new@test.com",
                password: "123",
                phone: "999",
                profileImage: "img",
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.token).toBe("token");
        expect(res.body.user.email).toBe("new@test.com");
    });
});


describe("POST /api/v1/auth/forgot-password", () => {
    test("should return 400 if email missing", async () => {
        const res = await request(app).post("/api/v1/auth/forgot-password").send({});
        expect(res.statusCode).toBe(400);
    });

    test("should respond gracefully if email not found", async () => {
        User.findOne.mockResolvedValueOnce(null);
        const res = await request(app)
            .post("/api/v1/auth/forgot-password")
            .send({ email: "unknown@test.com" });
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain("If that email exists");
    });
});


describe("POST /api/v1/auth/reset-password", () => {
    test("should return 400 if token or password missing", async () => {
        const res = await request(app).post("/api/v1/auth/reset-password").send({});
        expect(res.statusCode).toBe(400);
    });

    test("should return 400 if token invalid", async () => {
        jwt.verify.mockImplementationOnce(() => {
            throw new Error("Invalid token");
        });
        const res = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ token: "badtoken", password: "123" });
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Invalid or expired token");
    });
});



describe("POST /api/v1/auth/google", () => {
    test("should return 400 if googleToken missing", async () => {
        const res = await request(app).post("/api/v1/auth/google").send({});
        expect(res.statusCode).toBe(400);
        expect(res.body.message).toBe("Google token is required");
    });

    test("should create user if Google user not found", async () => {
        axios.get.mockResolvedValueOnce({
            data: { email: "google@test.com", sub: "g123", name: "GUser" },
        });
        User.findOne.mockResolvedValueOnce(null);
        const mockSave = vi.fn().mockResolvedValue(true);
        User.prototype.save = mockSave;
        jwt.sign.mockReturnValueOnce("googletoken");

        const res = await request(app)
            .post("/api/v1/auth/google")
            .send({ googleToken: "validtoken" });

        expect(res.statusCode).toBe(200);
        expect(res.body.user.email).toBe("google@test.com");
        expect(res.body.token).toBe("googletoken");
    });
});
