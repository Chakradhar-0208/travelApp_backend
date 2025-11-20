import admin from "firebase-admin";

let serviceAccount;

// If secret is provided by CI or production
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // Local fallback for development
    const localKey = await import("./serviceAccountKey.json", {
        assert: { type: "json" }
    });
    serviceAccount = localKey.default;
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

export default admin;
