import rateLimit from "express-rate-limit"

export const rateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Rate Limit Exceeded. Try again after 15 Minutes"
})