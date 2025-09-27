import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import "./config/mongoDB.js";
import testDB from "./routes/testDB.js";
import userRoutes from "./routes/userManagementRoute.js";
import reviewRoutes from "./routes/reviewManagementRoute.js";
import journeyRoutes from "./routes/journeyManagementRoute.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.use("/testDB", testDB);
app.use("/api/v1/users",userRoutes);
app.use("/api/v1/trips",reviewRoutes);
app.use("/api/v1/journeys",journeyRoutes);


app.get("/", (req, res) => {
  res.send("Welcome to the Travel App API");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
