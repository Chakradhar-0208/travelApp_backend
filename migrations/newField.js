import mongoose from "mongoose";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function newField() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

    await User.updateMany(
      { gender: { $exists: false } }, // Adds the field if not existing 
      { $set: { gender: null } }
    );
    console.log("Gender field added to Users.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

newField();
