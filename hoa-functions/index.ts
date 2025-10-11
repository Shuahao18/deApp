// // firebase/functions/src/index.ts (EXAMPLE CLOUD FUNCTION)
// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';

// // Initialize Firebase Admin SDK
// admin.initializeApp();

// // Ensure this function is called only by authenticated users (Admins)
// export const updateUserPassword = functions.https.onCall(async (data, context) => {
//     // 1. Check Authentication (must be logged in)
//     if (!context.auth) {
//         throw new functions.https.HttpsError('unauthenticated', 'The function must be called by an authenticated user.');
//     }

//     const { uid, newPassword } = data;

//     // 2. Simple input validation
//     if (!uid || typeof uid !== 'string' || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
//         throw new functions.https.HttpsError('invalid-argument', 'Invalid UID or password provided.');
//     }
    
//     // NOTE: You should add logic here to check if the calling user (context.auth.uid) 
//     // is actually an ADMIN before proceeding.

//     try {
//         // 3. Use Admin SDK to update the user's password
//         await admin.auth().updateUser(uid, {
//             password: newPassword,
//         });

//         return { success: true, message: `Successfully updated password for user ${uid}` };

//     } catch (error) {
//         console.error("Firebase Admin SDK failed to update password:", error);
//         throw new functions.https.HttpsError('internal', 'Failed to update password in Firebase Auth.');
//     }
// });