import React, { useState } from "react";
import axios from "axios";
import ReCAPTCHA from "react-google-recaptcha";
import { useNavigate, Link } from "react-router-dom";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const LOGIN_URL = `${API_BASE}/api/auth/staff/login`;
const RECAPTCHA_SITE_KEY = "YOUR_RECAPTCHA_SITE_KEY"; // replace with your key

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (!captchaToken) {
      setError("Please complete the reCAPTCHA.");
      return;
    }

    try {
      setLoading(true);
      const { data } = await axios.post(
        LOGIN_URL,
        { email, password, captchaToken },
        { withCredentials: true, timeout: 15000 }
      );

      if (!data?.user) {
        setError("Invalid login response from server.");
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));

      const role = data.user.role?.toLowerCase();
      const service = data.user.service_type?.toLowerCase();

      if (role === "superadmin") navigate("/patients");
      else if (service) navigate(`/${service}/calendar`);
      else setError(`Unauthorized or unknown service: ${service || "none"}`);
    } catch (err) {
      console.error("❌ Login error:", err.response?.data || err.message);
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
      setPassword("");
      setCaptchaToken(""); // reset captcha
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
            onChange={(e) => setEmail(e.target.value.trim())}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <ReCAPTCHA
            sitekey={RECAPTCHA_SITE_KEY}
            onChange={(token) => setCaptchaToken(token)}
          />

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="switch-link">
          Don’t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>

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
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
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
        }
        input:focus { border-color: #2563eb; }
        button {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }
        button:hover:not(:disabled) { background: #1e40af; }
        button:disabled { opacity: 0.7; cursor: not-allowed; }
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
        .switch-link a:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
