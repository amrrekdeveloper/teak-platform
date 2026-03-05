import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "teak-manufacturing",
  });
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
