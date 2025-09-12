import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// 🔹 HTTPS Callable Function to delete user
exports.deleteUser = functions.https.onCall(async (data, context) => {
  const uid = data.uid;

  // Security check: Only admins can call
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to delete users.",
    );
  }

  try {
    // 1. Delete from Auth
    await admin.auth().deleteUser(uid);
    console.log(`✅ Deleted auth user: ${uid}`);

    // 2. Delete from Firestore
    await db.collection("members").doc(uid).delete();
    console.log(`✅ Deleted Firestore doc: ${uid}`);

    return {success: true, message: `User ${uid} deleted.`};
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    throw new functions.https.HttpsError("unknown", error.message, error);
  }
});
