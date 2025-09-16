import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js"
import { requireRole } from "./middlewares/requireRole.js";
import validateToken from "./middlewares/auth.js";
import { rateLimiter } from "./middlewares/rateLimiting.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(rateLimiter)


mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME })
  .then(() => console.log("Connected to DB"))
  .catch((err) => console.error("DB Error: ", err))


app.get("/", (req, res) => {
  res.send("Welcome to the Travel App API");
});

// app.use("/auth", authRoutes)

app.use("/test", validateToken, requireRole("admin"), (req, res) => res.send("Hola"))

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});

