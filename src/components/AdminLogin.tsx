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
    <div className="login-container">
      <h2>Admin Login</h2>
      <div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button onClick={handleLogin}>Login</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </div>
    </div>
  );
};

export default AdminLogin;
