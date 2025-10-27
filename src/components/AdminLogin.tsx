import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  confirmPasswordReset,
  applyActionCode,
} from "firebase/auth";
import { auth, db } from "../Firebase";
import { useNavigate } from "react-router-dom";
import {
  FiUser,
  FiLock,
  FiEye,
  FiEyeOff,
  FiMail,
  FiCheckCircle,
  FiXCircle,
} from "react-icons/fi";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // 🆕 STATES FOR FORGOT PASSWORD MODAL (Multi-Step Flow)
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  // Color Constants (Matching original request)
  const PrimaryGreen = "#0C5D47";
  const DarkerGreen = "#084C40";
  const HighlightYellow = "#FFC43A";

  // Image URLs
  const WORK_IMAGE_URL = "/work.png"; // Make sure this image is in your public folder

  // Allowed roles for login
  const ALLOWED_ROLES = [
    "President",
    "Vice President",
    "Treasurer",
    "Secretary",
  ];

  // --- Utility Functions ---

  const cleanOobCode = (input: string | null | undefined): string | null => {
    if (!input) return null;
    const cleanInput = input.trim();

    try {
      // 1. Try to extract from a full URL
      if (cleanInput.startsWith("http")) {
        const url = new URL(cleanInput);
        const oobCode = url.searchParams.get("oobCode");
        return oobCode || cleanInput;
      }

      // 2. If it contains 'oobCode=' but not a full URL
      const match = cleanInput.match(/oobCode=([^&]+)/);
      if (match && match[1]) {
        return match[1];
      }

      // 3. Assume it is the raw code
      if (
        cleanInput.length > 20 &&
        !cleanInput.includes(" ") &&
        !cleanInput.includes("&")
      ) {
        return cleanInput;
      }

      return null;
    } catch (e) {
      // Fallback: assume the whole thing is the code if it looks long enough
      if (cleanInput.length > 20 && !cleanInput.includes(" ")) {
        return cleanInput;
      }
      return null;
    }
  };

  const resetForgotPasswordFlow = () => {
    setShowResetModal(false);
    setResetStep(1);
    setResetEmail("");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setResetLoading(false);
    setError("");
    setResetMessage("");
  };

  // --- Handler Functions ---

  const handleLogin = async () => {
    setError("");
    setResetMessage("");
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // Check if user is Admin in admin collection
      const adminDocRef = doc(db, "admin", uid);
      const adminDocSnap = await getDoc(adminDocRef);

      if (adminDocSnap.exists() && adminDocSnap.data().role === "Admin") {
        console.log("✅ Welcome Admin:", uid);
        navigate("/dashboard");
        return;
      }

      // Check if user is an official in elected_officials collection
      const officialsQuery = query(
        collection(db, "elected_officials"),
        where("authUid", "==", uid)
      );
      const officialsSnapshot = await getDocs(officialsQuery);

      if (!officialsSnapshot.empty) {
        const officialData = officialsSnapshot.docs[0].data();
        const userRole = officialData.position;

        // Check if the role is allowed
        if (ALLOWED_ROLES.includes(userRole)) {
          console.log(`✅ Welcome ${userRole}:`, uid);
          navigate("/dashboard");
          return;
        } else {
          await signOut(auth);
          throw new Error(
            `Access denied. ${userRole} role cannot access this system.`
          );
        }
      }

      // If user is not found in either collection
      await signOut(auth);
      throw new Error(
        "Access denied. No valid admin or official account found."
      );
    } catch (err: any) {
      const message = err.message.includes("Firebase:")
        ? "Invalid credentials or user access denied."
        : err.message;
      setError("Login failed: " + message);
    }
  };

  // STEP 1: Send Reset Email
  const handleSendResetEmail = async () => {
    if (!resetEmail) {
      setError("Please enter your email address.");
      return;
    }
    setResetLoading(true);
    setError("");
    setResetMessage("");

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage(
        `Success! A password reset link has been sent to ${resetEmail}. Copy the entire link or the code part.`
      );
      setResetStep(2);
    } catch (err: any) {
      console.error("Reset email error:", err.code);
      let message =
        "Failed to send reset email. Please ensure the email is correct.";
      if (err.code === "auth/user-not-found") {
        message = "No account found with this email.";
      }
      setError(message);
    } finally {
      setResetLoading(false);
    }
  };

  // STEP 2: Verify Code and Move to New Password
  const handleVerifyCode = async () => {
    if (!resetCode) {
      setError("Please paste the reset code or link from your email.");
      return;
    }

    setResetLoading(true);
    setError("");
    setResetMessage("");

    const actualCode = cleanOobCode(resetCode);

    if (!actualCode) {
      setResetLoading(false);
      setError(
        "Could not extract a valid reset code. Please ensure you pasted the correct link or code part."
      );
      return;
    }

    setResetCode(actualCode);
    setResetStep(3);
    setResetLoading(false);
  };

  // STEP 3: Confirm New Password
  const handleConfirmPasswordReset = async () => {
    if (!newPassword || !confirmNewPassword) {
      setError("Please enter and confirm your new password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }

    setResetLoading(true);
    setError("");
    setResetMessage("");

    try {
      await confirmPasswordReset(auth, resetCode, newPassword);

      setResetMessage(
        "✅ Success! Your password has been reset. You can now log in."
      );

      setTimeout(() => {
        resetForgotPasswordFlow();
        setEmail(resetEmail);
        setPassword("");
      }, 3000);
    } catch (err: any) {
      console.error("Password reset error:", err.code);
      let message =
        "Failed to reset password. The code may be invalid or expired. Please request a new link.";
      if (err.code === "auth/expired-action-code") {
        message = "Reset code has expired. Please request a new reset email.";
      } else if (err.code === "auth/weak-password") {
        message = "Password is too weak. Please choose a stronger password.";
      } else if (err.code === "auth/invalid-action-code") {
        message =
          "Invalid or already used reset code. Please request a new link.";
      }
      setError(message);
    } finally {
      setResetLoading(false);
    }
  };

  // --- Render Functions ---

  const renderModalContent = () => {
    switch (resetStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center text-gray-800">
              Reset Password (Step 1 of 3)
            </h3>
            <p className="text-sm text-center text-gray-600">
              Enter your email address to receive a password reset link.
            </p>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <FiMail className="w-5 h-5" />
              </span>
              <input
                type="email"
                placeholder="Enter your email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-800 transition-shadow"
                disabled={resetLoading}
              />
            </div>

            <div className="flex justify-between space-x-4 pt-4">
              <button
                onClick={resetForgotPasswordFlow}
                className="w-1/2 py-3 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                disabled={resetLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleSendResetEmail}
                className={`w-1/2 py-3 rounded-lg text-white font-semibold transition-colors flex justify-center items-center ${resetLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
                disabled={resetLoading || !resetEmail}
              >
                {resetLoading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center text-gray-800">
              Verify Reset Code (Step 2 of 3)
            </h3>
            <p className="text-sm text-center text-gray-600 font-bold">
              A link has been sent to{" "}
              <span className="text-green-600">{resetEmail}</span>.
            </p>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 space-y-3 text-sm">
              <p className="font-semibold text-blue-700">Instructions:</p>
              <p className="text-blue-600">
                1. **RECOMMENDED:** Open the email and **copy the ENTIRE
                password reset link**.
              </p>
              <p className="text-blue-600">
                2. **Paste the full link** into the box below. The system will
                extract the code for you.
              </p>
              <p className="text-blue-600 italic">
                Example of code:
                M3S3YuPmHUElrG3_N-sx_B9sc1PDMU2M2xtQcAAAGZzvZNrA
              </p>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500">
                <FiLock className="w-5 h-5" />
              </span>
              <textarea
                placeholder="Paste the full reset link or just the code here..."
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                rows={3}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-800 transition-shadow resize-none"
              />
            </div>

            <div className="flex justify-between space-x-4 pt-4">
              <button
                onClick={() => setResetStep(1)}
                className="w-1/2 py-3 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                disabled={resetLoading}
              >
                Back (Resend Email)
              </button>
              <button
                onClick={handleVerifyCode}
                className={`w-1/2 py-3 rounded-lg text-white font-semibold transition-colors flex justify-center items-center ${resetLoading || !resetCode ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
                disabled={resetLoading || !resetCode}
              >
                {resetLoading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  "Proceed to Password"
                )}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center text-gray-800">
              Set New Password (Step 3 of 3)
            </h3>
            <p className="text-sm text-center text-gray-600">
              Enter your new password (min. 6 characters).
            </p>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <FiLock className="w-5 h-5" />
              </span>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-800 transition-shadow"
                disabled={resetLoading}
              />
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <FiLock className="w-5 h-5" />
              </span>
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 bg-white text-gray-800 transition-shadow"
                disabled={resetLoading}
              />
            </div>

            <div className="flex justify-between space-x-4 pt-4">
              <button
                onClick={() => setResetStep(2)}
                className="w-1/2 py-3 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
                disabled={resetLoading}
              >
                Back (Change Code)
              </button>
              <button
                onClick={handleConfirmPasswordReset}
                className={`w-1/2 py-3 rounded-lg text-white font-semibold transition-colors flex justify-center items-center ${resetLoading || !newPassword || !confirmNewPassword ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
                disabled={resetLoading || !newPassword || !confirmNewPassword}
              >
                {resetLoading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  "Reset Password"
                )}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // --- Main Render ---

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50 font-inter">
      {/* 1. Left Panel (Welcome Content with Work Image) */}
      <div
        className={`lg:flex lg:w-[60%] flex-col justify-center items-center p-12 relative overflow-hidden`}
        style={{ backgroundColor: DarkerGreen }}
      >
        <div className="w-full max-w-2xl text-center lg:text-left">
          {/* Work Image - Larger and Centered */}
          <div className="flex justify-center lg:justify-start mb-8"></div>

          {/* Welcome Text Block */}
          <div className="space-y-6">
            <h2
              className="text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight uppercase"
              style={{ color: HighlightYellow }}
            >
              WELCOME <br />
              TO HOA MS
            </h2>
            <div className="w-20 h-1 bg-yellow-400 mx-auto lg:mx-0"></div>
            <p className="text-xl lg:text-2xl text-white font-light leading-relaxed">
              Welcome to the Management System <br />
              of the <span className="font-semibold">SMUMHOA Inc.</span>
            </p>
          </div>

          {/* Decorative Elements */}
          <div className="mt-12 flex justify-center lg:justify-start">
            <div className="flex space-x-2">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="w-3 h-3 rounded-full bg-yellow-400 opacity-60"
                ></div>
              ))}
            </div>
          </div>
        </div>

        {/* Background Pattern */}
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-green-800 rounded-full -mr-32 -mb-32 opacity-20"></div>
        <div className="absolute top-0 left-0 w-32 h-32 bg-yellow-400 rounded-full -ml-16 -mt-16 opacity-20"></div>
      </div>

      {/* 2. Right Panel (Login Form) */}
      <div
        className="w-full lg:w-[40%] flex flex-col p-6 md:p-12 justify-center items-center"
        style={{ backgroundColor: PrimaryGreen }}
      >
        <div className="w-full max-w-md">
          {/* Login Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white text-center mb-2">
              Login into HOA MS
            </h1>
            <p className="text-yel text-center text-sm">
              Enter your credentials to access the system
            </p>
          </div>

          <div className="space-y-6">
            {/* Email Input (Username) */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <FiUser className="w-5 h-5" />
              </span>
              <input
                type="email"
                placeholder="Username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 bg-white text-gray-800 placeholder-gray-500 transition-all shadow-sm"
              />
            </div>

            {/* Password Input (PIN no.) */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <FiLock className="w-5 h-5" />
              </span>
              <input
                type={showPass ? "text" : "password"}
                placeholder="PIN no."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 bg-white text-gray-800 placeholder-gray-500 transition-all shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition"
                aria-label={showPass ? "Hide password" : "Show password"}
              >
                {showPass ? (
                  <FiEyeOff className="w-5 h-5" />
                ) : (
                  <FiEye className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Forgot Password Link and Sign In Button Container */}
            <div className="flex flex-col space-y-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(true);
                  setError("");
                  setResetEmail(email);
                }}
                className="text-sm text-right text-gray-200 hover:text-yellow-300 transition duration-200 font-medium"
              >
                Forgot password?
              </button>

              <button
                onClick={handleLogin}
                className="w-full bg-gray-800 text-white font-semibold py-3 rounded-xl shadow-lg hover:bg-gray-900 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] border-2 border-transparent hover:border-yellow-400"
                style={{ letterSpacing: "0.05em" }}
              >
                Sign In
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-red-300 text-center bg-red-800/20 p-3 rounded-lg mt-4 flex items-center justify-center border border-red-600/30">
                <FiXCircle className="w-4 h-4 mr-2" /> {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-8 transform transition-all duration-300 scale-100 opacity-100">
            {renderModalContent()}

            {resetMessage && (
              <p className="text-sm text-green-700 text-center bg-green-100 p-3 rounded-lg mt-4 border border-green-300 flex items-center justify-center">
                <FiCheckCircle className="w-4 h-4 mr-2" /> {resetMessage}
              </p>
            )}
            {error && !resetLoading && (
              <p className="text-sm text-red-700 text-center bg-red-100 p-3 rounded-lg mt-4 border border-red-300 flex items-center justify-center">
                <FiXCircle className="w-4 h-4 mr-2" /> {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogin;
