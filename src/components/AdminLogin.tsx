import React, { useState } from "react";
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, confirmPasswordReset, applyActionCode } from "firebase/auth"; // Added confirmPasswordReset
import { auth, db } from "../Firebase"; // Assuming these are correctly set up externally
import { useNavigate } from "react-router-dom"; // Assuming this is correctly set up externally
import { FiUser, FiLock, FiEye, FiEyeOff, FiMail, FiCheckCircle, FiXCircle } from "react-icons/fi"; 
import { doc, getDoc } from "firebase/firestore";

// The overall application structure should use the Inter font (default Tailwind)

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // 🆕 STATES FOR FORGOT PASSWORD MODAL (Multi-Step Flow)
  const [showResetModal, setShowResetModal] = useState(false); // ✅ CORRECTED STATE NAME
  const [resetStep, setResetStep] = useState(1); // 1: Email, 2: Code Verification, 3: New Password
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState(""); // This will hold the OOB code/link
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState(""); // For success messages

  // Color Constants (Matching original request)
  const PrimaryGreen = "#0C5D47";
  const DarkerGreen = "#084C40";
  const HighlightYellow = "#FFC43A";

  // --- Utility Functions ---

  // ✅ FIX 2: Added explicit type definition for TypeScript compatibility
  const cleanOobCode = (input: string | null | undefined): string | null => {
    if (!input) return null;
    const cleanInput = input.trim();

    try {
      // 1. Try to extract from a full URL
      if (cleanInput.startsWith('http')) {
        const url = new URL(cleanInput);
        const oobCode = url.searchParams.get('oobCode');
        return oobCode || cleanInput;
      }

      // 2. If it contains 'oobCode=' but not a full URL
      const match = cleanInput.match(/oobCode=([^&]+)/);
      if (match && match[1]) {
        return match[1];
      }
      
      // 3. Assume it is the raw code
      if (cleanInput.length > 20 && !cleanInput.includes(' ') && !cleanInput.includes('&')) {
        return cleanInput;
      }
      
      return null;
    } catch (e) {
      // Fallback: assume the whole thing is the code if it looks long enough
      if (cleanInput.length > 20 && !cleanInput.includes(' ')) {
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

      const docRef = doc(db, "admin", uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists() || docSnap.data().role !== "Admin") {
        await signOut(auth);
        throw new Error("Access denied. Only Admins can log in here.");
      }

      console.log("✅ Welcome Admin:", uid);
      navigate("/dashboard");
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
      setResetMessage(`Success! A password reset link has been sent to ${resetEmail}. Copy the entire link or the code part.`);
      setResetStep(2); // Move to code verification step
    } catch (err: any) {
      console.error("Reset email error:", err.code);
      let message = "Failed to send reset email. Please ensure the email is correct.";
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

    // Extract and clean the OOB code
    const actualCode = cleanOobCode(resetCode);
    
    if (!actualCode) {
      setResetLoading(false);
      setError("Could not extract a valid reset code. Please ensure you pasted the correct link or code part.");
      return;
    }
    
    // In web, we can't fully verify the code without setting the password in a separate step.
    // We update the state with the cleaned code, and rely on confirmPasswordReset in Step 3 for final validation.
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
      // ✅ FIX 3: Using confirmPasswordReset which accepts 3 arguments (auth, code, newPassword)
      await confirmPasswordReset(auth, resetCode, newPassword); 

      setResetMessage("✅ Success! Your password has been reset. You can now log in.");
      
      // Close the modal and reset after a slight delay
      setTimeout(() => {
        resetForgotPasswordFlow();
        setEmail(resetEmail); // Pre-fill login email
        setPassword("");
      }, 3000);
      
    } catch (err: any) {
      console.error("Password reset error:", err.code);
      let message = "Failed to reset password. The code may be invalid or expired. Please request a new link.";
      if (err.code === "auth/expired-action-code") {
        message = "Reset code has expired. Please request a new reset email.";
      } else if (err.code === "auth/weak-password") {
        message = "Password is too weak. Please choose a stronger password.";
      } else if (err.code === "auth/invalid-action-code") {
        message = "Invalid or already used reset code. Please request a new link.";
      }
      setError(message);
    } finally {
      setResetLoading(false);
    }
  };


  // --- Render Functions ---

  const renderModalContent = () => {
    switch (resetStep) {
      case 1: // Send Email
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center text-gray-800">Reset Password (Step 1 of 3)</h3>
            <p className="text-sm text-center text-gray-600">Enter your email address to receive a password reset link.</p>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><FiMail className="w-5 h-5" /></span>
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
                className={`w-1/2 py-3 rounded-lg text-white font-semibold transition-colors flex justify-center items-center ${resetLoading ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                disabled={resetLoading || !resetEmail}
              >
                {resetLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </div>
          </div>
        );

      case 2: // Code Verification Instructions
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center text-gray-800">Verify Reset Code (Step 2 of 3)</h3>
            <p className="text-sm text-center text-gray-600 font-bold">A link has been sent to <span className="text-green-600">{resetEmail}</span>.</p>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 space-y-3 text-sm">
                <p className="font-semibold text-blue-700">Instructions:</p>
                <p className="text-blue-600">1. **RECOMMENDED:** Open the email and **copy the ENTIRE password reset link**.</p>
                <p className="text-blue-600">2. **Paste the full link** into the box below. The system will extract the code for you.</p>
                <p className="text-blue-600 italic">Example of code: M3S3YuPmHUElrG3_N-sx_B9sc1PDMU2M2xtQcAAAGZzvZNrA</p>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500"><FiLock className="w-5 h-5" /></span>
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
                className={`w-1/2 py-3 rounded-lg text-white font-semibold transition-colors flex justify-center items-center ${resetLoading || !resetCode ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                disabled={resetLoading || !resetCode}
              >
                {resetLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  'Proceed to Password'
                )}
              </button>
            </div>
          </div>
        );

      case 3: // Set New Password
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center text-gray-800">Set New Password (Step 3 of 3)</h3>
            <p className="text-sm text-center text-gray-600">Enter your new password (min. 6 characters).</p>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><FiLock className="w-5 h-5" /></span>
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><FiLock className="w-5 h-5" /></span>
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
                className={`w-1/2 py-3 rounded-lg text-white font-semibold transition-colors flex justify-center items-center ${resetLoading || !newPassword || !confirmNewPassword ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
                disabled={resetLoading || !newPassword || !confirmNewPassword}
              >
                {resetLoading ? (
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                  'Reset Password'
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
    // Main container uses flex layout for split screen on desktop
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50 font-inter">
      
      {/* 1. Left Panel (Illustration) */}
      <div
        className={`hidden lg:flex lg:w-[60%] flex-col justify-center items-center p-12 relative overflow-hidden`}
        style={{ backgroundColor: DarkerGreen }}
      >
        <img
          src="./assets/logo.png"
          alt="HOA Management System Illustration"
          className="w-full h-auto max-w-[800px] object-cover opacity-90 transition-transform duration-500 ease-in-out hover:scale-[1.01]"
        />
      </div>

      {/* 2. Right Panel (Login Form) */}
      <div
        className="w-full lg:w-[40%] flex flex-col p-6 md:p-12 justify-center items-center"
        style={{ backgroundColor: PrimaryGreen }}
      >
        <div className="w-full max-w-md">
          {/* Top Logo and Crest/Seal */}
          <div className="flex justify-between items-center mb-6">
            <div className="text-white text-lg font-semibold">HOA MS</div>
            <img
              src="./assets/Work.png"
              alt="HOA Seal"
              className="w-16 h-16 rounded-full border-2 border-white shadow-lg"
            />
          </div>

          {/* Large Welcome Text Block */}
          <h2
            className="text-4xl font-extrabold tracking-tight mb-2 uppercase"
            style={{ color: HighlightYellow }}
          >
            WELCOME <br />
            TO HOA MS
          </h2>
          <p className="text-lg text-white font-light mb-8">
            Welcome to the Management System of the SMUMHOA Inc.
          </p>

          {/* Login into HOA MS Header */}
          <h1 className="text-2xl font-bold text-white text-left mb-6 border-b border-gray-500 pb-2">
            Login into HOA MS
          </h1>

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
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:ring-white bg-white text-gray-800 placeholder-gray-500 transition-shadow shadow-inner"
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
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:ring-white bg-white text-gray-800 placeholder-gray-500 transition-shadow shadow-inner"
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
              {/* Forgot Password Link - 💡 OPEN MODAL */}
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(true); // ✅ FIXED: Use the correct setter
                  setError(""); // Clear main login error
                  setResetEmail(email); // Pre-fill with login email
                }}
                className="text-sm text-right text-gray-200 hover:text-white transition duration-200"
              >
                Forgot password?
              </button>

              {/* Button (Styled dark gray to match Figma's "Sign Up" button style) */}
              <button
                onClick={handleLogin}
                className="w-full bg-gray-800 text-white font-semibold py-3 rounded-xl shadow-lg hover:bg-gray-900 transition-colors duration-300 transform hover:scale-[1.01]"
                style={{ letterSpacing: "0.05em" }}
              >
                Sign In
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-red-300 text-center bg-red-800/20 p-2 rounded-lg mt-4 flex items-center justify-center">
                <FiXCircle className="w-4 h-4 mr-2" /> {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* --------------------
      | 3. FORGOT PASSWORD MODAL (Web Implementation)
      -------------------- */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-8 transform transition-all duration-300 scale-100 opacity-100">
            {renderModalContent()}
            
            {/* Shared Error/Success Messages for Modal */}
            {resetMessage && (
              <p className="text-sm text-green-700 text-center bg-green-100 p-3 rounded-lg mt-4 border border-green-300 flex items-center justify-center">
                <FiCheckCircle className="w-4 h-4 mr-2" /> {resetMessage}
              </p>
            )}
            {error && !resetLoading && ( // Show modal-specific errors
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