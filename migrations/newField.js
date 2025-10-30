import mongoose from "mongoose";
import Trip from "../models/Trip.js";
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

   const result =   Trip.updateMany(
  { createdBy: { $exists: false } },
  { $set: { createdBy: ObjectId("68bc4f33d545fbea2f801358") } } // replace with a real user ID
);
  

    console.log(`Migration success, ${result.modifiedCount} documents affected.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

newField();
