import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import testingRoutes from "./routes/testingRoute.js";
import homeRoute from "./routes/homeRoute.js"

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

app.use("/testing", testingRoutes);
app.use("/home", homeRoute)

app.get("/", (req, res) => res.send("Backend is running!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));