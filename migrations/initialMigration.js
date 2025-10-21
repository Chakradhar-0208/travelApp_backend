import mongoose from "mongoose";
import Trip from "../models/Trip.js";
import Review from "../models/Review.js";
import Journey from "../models/Journey.js";
import User from "../models/User.js";
import Report from "../models/Report.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function migrate() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

    await User.createIndexes();
    console.log("User indexes created.");

    await Trip.createIndexes();
    console.log("Trip indexes created.");

    await Review.createIndexes();
    console.log("Review indexes created.");

    await Journey.createIndexes();
    console.log("Journey indexes created.");

    await Report.createIndexes();
    console.log("Report indexes created.");

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

migrate(); //This creates schemas if not existed in DB


