import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../Firebase";
import { useNavigate } from "react-router-dom";
import { FiUser, FiLock, FiEye, FiEyeOff } from "react-icons/fi";

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      console.log("Logged in UID:", userCred.user.uid);
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

          <button
            onClick={handleLogin}
            className="w-full bg-gray-700 text-white py-2 rounded hover:bg-gray-800 transition"
          >
            Sign Up
          </button>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
