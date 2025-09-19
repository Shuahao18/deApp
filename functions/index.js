import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// 🔹 HTTPS Callable Function to delete user
exports.deleteUser = functions.https.onCall(async (data, context) => {
  const uidToDelete = data.uid;

  // 1. 🚫 Critical Security Check: Is the caller authenticated?
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to delete users."
    );
  }

  // 2. 🛡️ CRITICAL SECURITY CHECK: Is the caller an admin?
  const callerUid = context.auth.uid;
  const adminDoc = await db.collection("admin").doc(callerUid).get();

  if (!adminDoc.exists()) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only authorized administrators can perform this action."
    );
  }

  // 3. 📝 Optional: Check for a specific role field if your admin documents have one
  const adminRole = adminDoc.data()?.accountRole;
  if (adminRole !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Your account does not have the necessary permissions."
      );
  }

  // 4. Validate input
  if (!uidToDelete) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The user UID to delete is required."
    );
  }

  try {
    // 5. Delete from Auth
    await admin.auth().deleteUser(uidToDelete);
    console.log(`✅ Deleted auth user: ${uidToDelete}`);

    // 6. Delete from Firestore
    await db.collection("members").doc(uidToDelete).delete();
    console.log(`✅ Deleted Firestore doc: ${uidToDelete}`);

    return { success: true, message: `User ${uidToDelete} deleted.` };
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    throw new functions.https.HttpsError("unknown", error.message, error);
  }
});

// 🔹 HTTPS Callable Function to get the total number of users
exports.getTotalUsers = functions.https.onCall(async (data, context) => {
  try {
    // Note: listUsers() retrieves up to 1000 users per call.
    // For very large projects, you may need to implement pagination.
    const listUsersResult = await admin.auth().listUsers();
    const totalUsers = listUsersResult.users.length;
    return { totalUsers };
  } catch (error) {
    console.error("Error fetching user count:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while fetching the user count."
    );
  }
});