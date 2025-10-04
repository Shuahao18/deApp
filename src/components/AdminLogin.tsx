import React, { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "../Firebase";
import { useNavigate } from "react-router-dom";
import { FiUser, FiLock, FiEye, FiEyeOff } from "react-icons/fi";
import { doc, getDoc } from "firebase/firestore";

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");
    try {
      // 🔹 1. Login with Firebase Auth
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // 🔹 2. Get role from Firestore (admins collection)
      const docRef = doc(db, "admin", uid); // 👈 collection should be lowercase + plural
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        // Not registered as admin
        await signOut(auth);
        throw new Error("No admin record found for this account.");
      }

      const userData = docSnap.data();

      // 🔹 3. Check role or flag
      if (userData.role !== "Admin") {
        await signOut(auth); // kick them out
        throw new Error("Access denied. Only Admins can log in here.");
      }

      // ✅ 4. If Admin, go to dashboard
      console.log("✅ Welcome Admin:", uid);
      navigate("/dashboard");

    } catch (err: any) {
      setError("Login failed: " + err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0C5D47]">
      <div className="bg-white p-8 rounded-md shadow-lg w-full max-w-sm">
        <img src="/logo.png" alt="Logo" className="mx-auto mb-4 w-20 h-20" />
        <h1 className="text-xl font-bold text-gray-800 text-center mb-2">
          Login into HOA MS
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Welcome to the Management System of the SMUMHOA Inc.
        </p>

        <div className="space-y-4">
          {/* Email */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <FiUser />
            </span>
            <input
              type="email"
              placeholder="Username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded focus:outline-none"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <FiLock />
            </span>
            <input
              type={showPass ? "text" : "password"}
              placeholder="PIN no."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showPass ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          {/* Button */}
          <button
            onClick={handleLogin}
            className="w-full bg-gray-700 text-white py-2 rounded hover:bg-gray-800 transition"
          >
            Sign In
          </button>

          {/* Error Message */}
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
