import admin from "firebase-admin";

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "teak-manufacturing",
      });
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to projectId only:", e);
      admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "teak-manufacturing",
      });
    }
  } else {
    admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || "teak-manufacturing",
    });
  }
}

export async function verifyFirebaseToken(idToken: string): Promise<{ phone: string } | null> {
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    if (decoded.phone_number) {
      return { phone: decoded.phone_number };
    }
    return null;
  } catch (error) {
    console.error("Firebase token verification failed:", error);
    return null;
  }
}

export default admin;
