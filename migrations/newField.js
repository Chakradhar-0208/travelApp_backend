import mongoose from "mongoose";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function migrateSavedTrips() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "travelApp",
    });
    console.log("DB Connected");

    const result = await User.updateMany(
      { savedTrips: { $exists: false } },       // only documents missing the field
      { $set: { savedTrips: [] } }
    );

    console.log(
      `Migration success. ${result.modifiedCount} documents updated.`
    );
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

migrateSavedTrips();
