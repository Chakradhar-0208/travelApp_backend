import request from "supertest";
import { describe, test, expect, vi, beforeEach } from "vitest";
import User from "../../models/User.js"
import app from "../../index.js";
import bcrypt from "bcryptjs";
import { transporter } from "../../config/transporter.js";
import jwt from "jsonwebtoken"
import axios from "axios";

vi.mock("../../config/transporter.js", () => ({
    transporter: {
        sendMail: vi.fn().mockResolvedValue({ accepted: ["test@test.com"] }),
    },
}));

vi.mock("axios", () => ({
    default: {
        get: vi.fn(),
    },
}));

beforeEach(() => {
    process.env.JWT_SECRET = "testsecret";
});

describe("User signup", () => {
    test("creates a user", async () => {
        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({
                email: "kiran@verstappen.com",
                password: "10winsinarow",
                name: "kiran",
                profileImage: "hehe"
            });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });
    test("returns duplicate user", async () => {
        await User.create({
            email: "kiran@verstappen.com",
            password: "10winsinarow",
            name: "kiran",
            profileImage: "hehe"
        })
        const res = await request(app)
            .post("/api/v1/auth/register")
            .send({
                email: "kiran@verstappen.com",
                password: "10winsinarow",
                name: "kiran",
                profileImage: "hehe"
            });
        expect(res.status).toBe(400);

    })
    test("fails when required fields are missing", async () => {
        const res = await request(app).post("/api/v1/auth/register").send({
            email: "nope@test.com",
            password: "123",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Required fields missing.");
    });
});

describe("User Login", () => {
    test("logs in successfully with correct credentials", async () => {
        // Create a user with hashed password
        const hashed = await bcrypt.hash("fastest-driver", 10);
        await User.create({
            email: "kiran@verstappen.com",
            password: hashed,
            name: "Kiran",
            profileImage: "hehe",
            phone: "123",
            role: "user",
        });

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: "kiran@verstappen.com",
                password: "fastest-driver",
            });

        expect(res.status).toBe(200);
        expect(res.body.authToken).toBeDefined();
        expect(res.body.user.email).toBe("kiran@verstappen.com");
        expect(res.body.user.password).toBeUndefined();
    });
    test("logs in successfully with correct credentials", async () => {
        // Create a user with hashed password
        const hashed = await bcrypt.hash("fastest-driver", 10);
        await User.create({
            email: "kiran@verstappen.com",
            password: hashed,
            name: "Kiran",
            profileImage: "hehe",
            phone: "123",
            role: "user",
        });

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: "kiran@verstappen.com",
                password: "fastest-driver",
            });

        expect(res.status).toBe(200);
        expect(res.body.authToken).toBeDefined();
        expect(res.body.user.email).toBe("kiran@verstappen.com");
        expect(res.body.user.password).toBeUndefined();
    });
    test("returns 400 if email or password is missing", async () => {
        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({ email: "nope@test.com" });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/required/i);
    });
    test("returns 401 for non-existing user", async () => {
        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: "ghost@verstappen.com",
                password: "whatever",
            });

        expect(res.status).toBe(401);
    });
    test("returns 401 for incorrect password", async () => {
        const hashed = await bcrypt.hash("goodpass", 10);
        await User.create({
            email: "wrong@verstappen.com",
            password: hashed,
            name: "Kiran",
            profileImage: "hehe",
        });

        const res = await request(app)
            .post("/api/v1/auth/login")
            .send({
                email: "wrong@verstappen.com",
                password: "badpass",
            });

        expect(res.status).toBe(401);
    });



})

describe("Forgot Password", () => {
    test("returns 400 when email is missing", async () => {
        const res = await request(app)
            .post("/api/v1/auth/forgot-password")
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Email is required");
    });
    test("returns generic message even if user does not exist", async () => {
        const res = await request(app)
            .post("/api/v1/auth/forgot-password")
            .send({ email: "ghost@verstappen.com" });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/password reset link/i);
    });

    test("generates reset token, saves it, and sends email", async () => {
        const user = await User.create({
            email: "kiran@verstappen.com",
            password: "hashed",
            name: "Kiran",
            profileImage: "hehe",
        });

        const res = await request(app)
            .post("/api/v1/auth/forgot-password")
            .send({ email: "kiran@verstappen.com" });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/password reset link/i);

        const updated = await User.findById(user._id);
        expect(updated.resetToken).toBeDefined();
        expect(typeof updated.resetToken).toBe("string");

        // Email was "sent"
        expect(transporter.sendMail).toHaveBeenCalledTimes(1);

        // Confirm the email includes the generated token
        const sentData = transporter.sendMail.mock.calls[0][0];
        expect(sentData.to).toBe("kiran@verstappen.com");
        expect(sentData.html).toContain(updated.resetToken);
    });
})

describe("Reset Passoword", () => {

    test("resets password with valid token and clears resetToken", async () => {
        // Create user
        const user = await User.create({
            email: "kiran@verstappen.com",
            password: await bcrypt.hash("oldpass", 10),
            name: "Kiran",
            profileImage: "hehe",
        });

        // Generate reset token same way as forgot-password route
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "15m",
        });

        user.resetToken = token;
        await user.save();

        const res = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({
                token,
                password: "newpass123",
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Password reset successful");

        const updated = await User.findById(user._id);

        // password should be changed and hashed
        expect(await bcrypt.compare("newpass123", updated.password)).toBe(true);
        expect(await bcrypt.compare("oldpass", updated.password)).toBe(false);

        // resetToken should be cleared
        expect(updated.resetToken).toBeFalsy();
    });

    test("returns 400 if token or password is missing", async () => {
        const res1 = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ token: "abc" });

        expect(res1.status).toBe(400);
        expect(res1.body.message).toMatch(/required/i);

        const res2 = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({ password: "newpass" });

        expect(res2.status).toBe(400);
        expect(res2.body.message).toMatch(/required/i);
    });

    test("returns 400 for invalid token", async () => {
        const res = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({
                token: "totally-invalid-token",
                password: "whatever",
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid or expired token/i);
    });

    test("returns 400 if token does not match stored resetToken", async () => {
        const user = await User.create({
            email: "kiran@verstappen.com",
            password: await bcrypt.hash("oldpass", 10),
            name: "Kiran",
            profileImage: "hehe",
            resetToken: "some-other-token",
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: "15m",
        });

        const res = await request(app)
            .post("/api/v1/auth/reset-password")
            .send({
                token,
                password: "newpass123",
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid or expired token/i);
    });

})

describe("Google Login", () => {

    test("creates a new user when Google token is valid", async () => {
        // Mock Google API response
        axios.get.mockResolvedValue({
            data: {
                email: "kiran@verstappen.com",
                name: "Kiran",
                sub: "google-user-id-123",
            },
        });

        const res = await request(app)
            .post("/api/v1/auth/google")
            .send({
                googleToken: "valid-google-token",
                deviceInfo: "Pixel 7 Pro", // optional
            });

        expect(res.status).toBe(200);
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe("kiran@verstappen.com");
        expect(res.body.token).toBeDefined();

        // The user should be created in DB
        const dbUser = await User.findOne({ email: "kiran@verstappen.com" });

        expect(dbUser).toBeTruthy();
        expect(dbUser.googleId).toBe("google-user-id-123");
        expect(dbUser.profileImage).toBe("avatar2");
        expect(dbUser.phone).toBe("88888888");
    });

    test("logs in existing Google user", async () => {
        await User.create({
            email: "kiran@verstappen.com",
            name: "Old Name",
            googleId: "old-google-id",
            password: "#somehash",
            profileImage: "avatar2",
            phone: "88888888",
        });

        axios.get.mockResolvedValue({
            data: {
                email: "kiran@verstappen.com",
                name: "New Name From Google",
                sub: "new-google-id",
            },
        });

        const res = await request(app)
            .post("/api/v1/auth/google")
            .send({ googleToken: "valid-token" });

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe("kiran@verstappen.com");
        expect(res.body.user.googleId).toBe("new-google-id");

        // Verify database updated
        const updatedUser = await User.findOne({ email: "kiran@verstappen.com" });
        expect(updatedUser.googleId).toBe("new-google-id");
    });

    test("returns 400 if googleToken is missing", async () => {
        const res = await request(app)
            .post("/api/v1/auth/google")
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/google token is required/i);
    });

    test("returns 400 if Google returns invalid data", async () => {
        axios.get.mockResolvedValue({
            data: { email: null },
        });

        const res = await request(app)
            .post("/api/v1/auth/google")
            .send({ googleToken: "badtoken" });

        expect(res.status).toBe(400);
    });

});