import mongoose from "mongoose";
import Journey from "../models/Journey.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function updateField() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

    await Journey.updateMany({ totalDistance: { $type: "string" } }, [
      { $set: { totalDistance: { $toDouble: "$totalDistance" } } }, // Helps  in updating type of a field in DB.
    ]);
    console.log("Distance field updated to Number.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

updateField();
//update in model also
