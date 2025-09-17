import mongoose from "mongoose";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function renameField() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

    await User.updateMany({}, { $rename: { totalDistance: "tDist" } });   // Renames a field
    console.log("'totalDistance' renamed to 'tDist' for all users.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

renameField();
//update in model also