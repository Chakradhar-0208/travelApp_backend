import mongoose from "mongoose";
import Journey from "../models/Journey.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function removeIndex() {
  try {
    mongoose
      .connect(process.env.MONGO_URI, {
        dbName: "travelApp",
      })
      .then(() => console.log("DB Connected"))
      .catch((err) => console.error("DB connection error:", err));

    await Journey.collection.dropIndex("userId_1");   // Drops the Index from DB
    console.log("Index on 'userId' removed.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

removeIndex();
