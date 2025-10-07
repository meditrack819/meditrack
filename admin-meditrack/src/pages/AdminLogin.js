import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const LOGIN_URL = `${API_BASE}/api/auth/staff/login`;

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // 🔍 1. Basic client-side validation
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Invalid email format.");
      return;
    }

    try {
      setLoading(true);

      // 🔐 2. Send credentials securely (cookie-based)
      const { data } = await axios.post(
        LOGIN_URL,
        { email, password },
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true, // needed for HttpOnly cookie auth
          timeout: 15000,
        }
      );

      if (!data?.user) {
        setError("Invalid login response from server.");
        return;
      }

      // 🔑 3. Save user only (no token in localStorage)
      localStorage.setItem("user", JSON.stringify(data.user));

      // 🧭 4. Redirect by role/service
      const role = data.user.role?.toLowerCase();
      const service = data.user.service_type?.toLowerCase();

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
        setError("Request timed out. Please try again.");
      } else if (err.request && !err.response) {
        setError("Cannot reach the server. Please check your connection.");
      } else {
        setError(err.response?.data?.error || "Login failed");
      }
    } finally {
      setLoading(false);
      setPassword(""); // clear password from memory
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
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value.trim())}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="switch-link">
          Don’t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>

      {/* ✅ Inline secure responsive CSS */}
      <style>{`
        .auth-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #1e3a8a, #2563eb);
          padding: 20px;
        }

        .auth-card {
          background: #fff;
          padding: 40px 30px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 400px;
          text-align: center;
        }

        h2 {
          margin-bottom: 20px;
          color: #1f2937;
          font-size: 24px;
          font-weight: 700;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        input {
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s;
        }

        input:focus {
          border-color: #2563eb;
        }

        button {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.3s;
        }

        button:hover:not(:disabled) {
          background: #1e40af;
        }

        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .error {
          color: #dc2626;
          background: #fee2e2;
          border: 1px solid #fecaca;
          padding: 8px;
          border-radius: 6px;
          margin-bottom: 12px;
          font-size: 14px;
        }

        .switch-link {
          margin-top: 16px;
          font-size: 14px;
          color: #6b7280;
        }

        .switch-link a {
          color: #2563eb;
          font-weight: 500;
          text-decoration: none;
        }

        .switch-link a:hover {
          text-decoration: underline;
        }

        @media (max-width: 768px) {
          .auth-card {
            padding: 30px 20px;
            max-width: 90%;
          }
          h2 {
            font-size: 20px;
          }
          input, button {
            font-size: 15px;
            padding: 10px;
          }
        }

        @media (max-width: 480px) {
          .auth-card {
            padding: 25px 18px;
            border-radius: 10px;
          }
          h2 {
            font-size: 18px;
          }
          .switch-link {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}
