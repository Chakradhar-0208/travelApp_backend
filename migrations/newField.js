// import mongoose from "mongoose";
// import Review from "../models/Review.js";
// import dotenv from "dotenv";

// dotenv.config({ path: "../.env" });

// async function newField() {
//   try {
//     mongoose
//       .connect(process.env.MONGO_URI, {
//         dbName: "travelApp",
//       })
//       .then(() => console.log("DB Connected"))
//       .catch((err) => console.error("DB connection error:", err));

//    const result =  await Review.updateMany(
//        { checkpoints: { $exists: false } }, // Adds the field if not existing
//       { $set: { checkpoints:  [] } }
//     );
//     console.log(`Migration success, ${result.modifiedCount} documents affected.`);
//   } catch (error) {
//     console.error("Migration failed:", error);
//   } finally {
//     mongoose.disconnect();
//     console.log("DB Disconnected");
//   }
// }

// newField();

import mongoose from "mongoose";
import User from "../models/User.js";
import Trip from "../models/Trip.js";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

async function migrateNewFields() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "travelApp",
    });
    console.log("DB Connected");

    // ----------- Update Users -----------
    const userResult = await User.updateMany(
      { "preferences.tripDifficulty": { $exists: false } },
      {
        $set: {
          "preferences.tripDifficulty": null,  // optional: can default to null
          "preferences.altitudeSickness": false,
        },
      }
    );
    console.log(`Users updated: ${userResult.modifiedCount}`);

    // ----------- Update Trips -----------
    const tripResult = await Trip.updateMany(
      { keywords: { $exists: false } },
      {
        $set: {
          keywords: [],
          altitudeSickness: false,
        },
      }
    );
    console.log(`Trips updated: ${tripResult.modifiedCount}`);

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("DB Disconnected");
  }
}

migrateNewFields();
