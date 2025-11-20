import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME })
    .then(() => console.log("DB Connected"))
    .catch((err) => console.error("DB connection error:", err));
}

export default mongoose;
