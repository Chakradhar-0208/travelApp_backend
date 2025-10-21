import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

mongoose
  .connect(process.env.MONGO_URI, {
    dbName: "travelApp", //DataBase Name
  })
  .then(() => console.log("DB Connected"))
  .catch((err) => console.error("DB connection error:", err));

export default mongoose;
