// src/pages/AdminLogin.js
import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

// ✅ Correct base URL
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const url = `${API_BASE}/auth/staff/login`;

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // ✅ Final correct API endpoint
      const url = `${API_BASE}/auth/staff/login`;
      console.log("🔎 Posting to:", url);

      const { data } = await axios.post(
        url,
        { email, password },
        { headers: { "Content-Type": "application/json" }, timeout: 15000 }
      );

      console.log("🔑 Login response:", data);

      if (!data?.token || !data?.user) {
        setError("Invalid login response from server.");
        return;
      }

      // ✅ Save session
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      const role = data.user.role?.toLowerCase();
      const service = data.user.service_type?.toLowerCase();

      console.log("role:", role, "service:", service);

      // ✅ Redirect logic
      if (role === "superadmin") {
        navigate("/patients");
      } else if (service) {
        navigate(`/${service}/calendar`);
      } else {
        setError(`Unauthorized or unknown service: ${service || "none"}`);
      }
    } catch (err) {
      console.error("❌ Login error:", err.response?.data || err.message);
      if (err.code === "ECONNABORTED") {
        setError("Request timed out. Please try again or check the server.");
      } else if (err.request && !err.response) {
        setError("Cannot reach backend. Is it running on the server?");
      } else {
        setError(err.response?.data?.error || "Login failed");
      }
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Admin Login</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit} noValidate>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Login</button>
        </form>
        <p className="switch-link">
          Don’t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}



