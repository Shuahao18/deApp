const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true }); // 🔥 ADD CORS

admin.initializeApp();

// 🔥 ADD CORS HANDLING TO ALL FUNCTIONS

// Test function with CORS
exports.testHoaFunction = functions.https.onCall((data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Please log in first."
    );
  }

  return {
    success: true,
    message: "HOA Functions are working! 🎉",
    userId: context.auth.uid,
    timestamp: new Date().toISOString(),
  };
});

// Create user function with CORS
exports.createUserAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Please log in first."
    );
  }

  const { userData, password } = data;

  try {
    const userRecord = await admin.auth().createUser({
      email: userData.email,
      password: password,
    });

    const memberData = {
      ...userData,
      accNo: Math.floor(1000 + Math.random() * 9000).toString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await admin
      .firestore()
      .collection("members")
      .doc(userRecord.uid)
      .set(memberData);

    return {
      success: true,
      message: "User created successfully! No session change! 🎉",
    };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// 🔥 ADD THE MISSING getTrafficData FUNCTION
exports.getTrafficData = functions.https.onRequest((req, res) => {
  // Enable CORS
  cors(req, res, async () => {
    try {
      // For now, return dummy data to fix the 404 error
      const trafficData = {
        totalVisitors: 1500,
        newVisitors: 345,
        returningVisitors: 1155,
        pageViews: 4200,
        bounceRate: 42.5,
        sessions: 1678,
        data: [
          { date: "2024-01", visitors: 1200 },
          { date: "2024-02", visitors: 1350 },
          { date: "2024-03", visitors: 1500 },
        ],
      };

      res.status(200).json({
        success: true,
        data: trafficData,
      });
    } catch (error) {
      console.error("Error in getTrafficData:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch traffic data",
      });
    }
  });
});
