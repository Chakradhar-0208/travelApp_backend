import request from "supertest";
import mongoose from "mongoose";
import app from "../..";
import Notification from "../../models/Notification";
import User from "../../models/User";

vi.mock("../../middlewares/auth.js", () => ({
    default: (req, res, next) => {
        req.user = { userId: mockUserId };
        next();
    }
}));

let mockUserId;

beforeEach(() => {
    mockUserId = new mongoose.Types.ObjectId().toString();
});

describe("GET /api/v1/notifications", () => {

    test("returns empty list when user has no notifications", async () => {
        const res = await request(app).get("/api/v1/notifications");

        expect(res.status).toBe(200);
        expect(res.body.count).toBe(0);
        expect(res.body.notifications).toEqual([]);
    });

    test("returns only notifications belonging to the authenticated user", async () => {
        await Notification.create([
            {
                userId: mockUserId,
                title: "Welcome",
                description: "You joined the app!",
                type: "systemUpdates"
            },
            {
                userId: mockUserId,
                title: "New Trip",
                description: "A trek you might like!",
                type: "tripSuggestions"
            }
        ]);

        // Other user (should NOT appear)
        await Notification.create({
            userId: new mongoose.Types.ObjectId(),
            title: "Foreign",
            description: "Not yours",
            type: "systemUpdates"
        });

        const res = await request(app).get("/api/v1/notifications");

        expect(res.status).toBe(200);
        expect(res.body.count).toBe(2);
        expect(res.body.notifications.length).toBe(2);

        const hasForeign = res.body.notifications.some(
            (n) => n.userId !== mockUserId
        );
        expect(hasForeign).toBe(false);
    });

    test("returns notifications sorted by createdAt descending", async () => {
        await Notification.create([
            {
                userId: mockUserId,
                title: "Old",
                description: "Older event",
                type: "systemUpdates",
                createdAt: new Date("2023-01-01")
            },
            {
                userId: mockUserId,
                title: "New",
                description: "Latest event",
                type: "tripSuggestions",
                createdAt: new Date("2023-02-01")
            }
        ]);

        const res = await request(app).get("/api/v1/notifications");

        expect(res.status).toBe(200);

        const [first, second] = res.body.notifications;

        expect(first.title).toBe("New");
        expect(second.title).toBe("Old");
    });

    test("handles internal errors gracefully", async () => {
        const spy = vi.spyOn(Notification, "find").mockRejectedValue(
            new Error("DB broken")
        );

        const res = await request(app).get("/api/v1/notifications");

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Internal Server Error");

        spy.mockRestore();
    });
});

describe("POST /api/v1/notifications/subscribe", () => {

    test("returns 400 if fcmToken is missing", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@mail.com",
            password: "pass"
        });

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("fcmToken is Required");
    });

    test("successfully subscribes user with fcmToken only", async () => {
        await User.create({
            _id: mockUserId,
            name: "Kiran",
            email: "k@mail.com",
            password: "pass"
        });

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({
                fcmToken: "some_fcm_token_123"
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscribed Successfully");

        const updated = await User.findById(mockUserId);
        expect(updated.fcmToken).toBe("some_fcm_token_123");
    });

    test("updates user with fcmToken + preferences", async () => {
        await User.create({
            _id: mockUserId,
            name: "Max",
            email: "max@mail.com",
            password: "pass"
        });

        const prefs = {
            tripSuggestions: true,
            systemUpdates: false
        };

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({
                fcmToken: "fcm_6969",
                preferences: prefs
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscribed Successfully");

        const updated = await User.findById(mockUserId);

        expect(updated.fcmToken).toBe("fcm_6969");
        expect(updated.preferences.tripSuggestions).toBe(true);
        expect(updated.preferences.systemUpdates).toBe(false);
    });

    test("returns 500 if DB update throws error", async () => {
        const spy = vi
            .spyOn(User, "findByIdAndUpdate")
            .mockRejectedValue(new Error("DB dead"));

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({
                fcmToken: "boom"
            });

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Internal Server Error");

        spy.mockRestore();
    });

    test("returns 200 even if user doesn't exist (because Mongoose returns null)", async () => {
        // ✔ matches your real behavior: findByIdAndUpdate(null) doesn't throw automatically

        const res = await request(app)
            .post("/api/v1/notifications/subscribe")
            .send({
                fcmToken: "some_token"
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Subscribed Successfully");
    });

});