import request from "supertest";

const { default: app } = await import("../../index.js");

// ---------------------- GET / ---------------------- //

describe("GET /", () => {
  test("should return OK", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: "OK" });
  });
});
