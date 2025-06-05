import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../Firebase"; // make sure this exports your initialized auth instance
import { useNavigate } from "react-router-dom";

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError(""); // Reset previous errors
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      console.log("Logged in UID:", userCred.user.uid);

      // Navigate to dashboard immediately after successful login
      navigate("/dashboard");
    } catch (err: any) {
      console.error("[Login Error]", err.code, err.message);
      setError("Login failed: " + err.message);
    }
  };

  return (
   <div className="flex items-center
                   justify-center min-h-screen
                   bg-gray-100">
  <div className="bg-white
                    p-6 rounded
                    shadow-md 
                    w-full max-w-sm text-center">
    <h2 className="text-xl
                   font-semibold
                  mb-4">Admin Login</h2>
                  
    <div className="space-y-4">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full p-2 border rounded"
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="w-full p-2 border rounded"
        required
      />
      <button
        onClick={handleLogin}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
      >
        Login
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </div>
  </div>
</div>

  );
};

export default AdminLogin;
