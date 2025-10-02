// src/pages/Register.js
import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

// Hardcode backend API URL
const API_BASE = "http://localhost:5000/api";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    service_type: "medical", // default
    role: "staff",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const url = `${API_BASE}/auth/staff/register`;
      console.log("🔎 Posting to:", url);

      const { data } = await axios.post(url, form, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      });

      if (data.success) {
        setSuccess("Staff account created successfully!");
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        const role = data.user.role?.toLowerCase();
        const service = data.user.service_type?.toLowerCase();

        console.log("role:", role, "service:", service);

        // ✅ Redirect based on role/service
        if (role === "superadmin") {
          navigate("/patients");
        } else if (service) {
          navigate(`/calendar/${service}`);
        } else {
          setError(`Unauthorized or unknown service: ${service || "none"}`);
          navigate("/admin"); // fallback
        }
      } else {
        setError(data.error || "Registration failed");
      }
    } catch (err) {
      console.error("❌ Register error:", err.response?.data || err.message);
      if (err.code === "ECONNABORTED") {
        setError("Request timed out. Please check the server and try again.");
      } else if (err.request && !err.response) {
        setError("Cannot reach backend. Is it running on http://localhost:5000?");
      } else {
        setError(err.response?.data?.error || "Registration failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Create Staff Account</h2>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <input
            type="text"
            name="name"
            placeholder="Full Name"
            value={form.name}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
          />

          <select
            name="service_type"
            value={form.service_type}
            onChange={handleChange}
            required
          >
            <option value="medical">Medical</option>
            <option value="dental">Dental</option>
            <option value="pt">Physical Therapy</option>
            <option value="tb">TB</option>
            <option value="vax">Vaccination</option>
          </select>

          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        <p className="switch-link">
          Already have an account? <Link to="/admin">Login</Link>
        </p>
      </div>
    </div>
  );
}
