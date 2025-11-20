import mongoose from "mongoose";
import User from "../models/User.js";
import Review from "../models/Review.js";
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
async function newField() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

   const result =  await Review.updateMany(
       { checkpoints: { $exists: false } }, // Adds the field if not existing
      { $set: { checkpoints:  [] } }
    );
    console.log(`Migration success, ${result.modifiedCount} documents affected.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

migrateSavedTrips();
