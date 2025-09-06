import express from "express";
import mongoose from "mongoose";
import testDB from "./routes/testDB.js"
import dotenv from "dotenv";
import cors from "cors";
import testingRoutes from "./routes/testingRoute.js";
import homeRoute from "./routes/homeRoute.js"

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI, {
    dbName: "travelApp",
  })
  .then(() => console.log("DB Connected"))
  .catch((err) => console.error("DB connection error:", err));

app.use("/testDB",testDB);
app.use("/testing", testingRoutes);
app.use("/home", homeRoute)

app.get("/", (req, res) => {
  res.send("Welcome to the Travel App API");
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

