import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import "./configs/mongoDB.js";
import testDB from "./routes/testDB.js";
import userRoutes from "./routes/userManagementRoute.js";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.use("/testDB", testDB);
app.use("/api/v1",userRoutes);


app.get("/", (req, res) => {
  res.send("Welcome to the Travel App API");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
