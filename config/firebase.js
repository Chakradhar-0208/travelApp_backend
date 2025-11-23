// config/firebase.js
import admin from "firebase-admin";

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    throw err;
  }
} else {
  // Local fallback for development. Some Node versions return the JSON under .default.
  const local = await import("./serviceAccountKey.json", { assert: { type: "json" } });
  serviceAccount = local.default ?? local;
}

// Only initialize once (prevents "app already exists" errors in tests / hot reload)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
