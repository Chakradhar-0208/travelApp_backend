import mongoose from "mongoose";
import Review from "../models/Review.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function removeField() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

    const result = await Review.updateMany(
      {},
      { $unset: { checkpoints:[]} }
    ); // Deletes the field from DB
    console.log(`Migration success, ${result.modifiedCount} documents affected.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

removeField();
