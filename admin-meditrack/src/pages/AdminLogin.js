import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import { FiEye, FiEyeOff } from "react-icons/fi"; // 👁️ Professional icons

// 🔒 Security utilities
function sanitizeInput(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]*>?/gm, "").replace(/[<>`"'{}]/g, "").trim();
}

/* ---------------------------------------
   Configuration
--------------------------------------- */
const API_BASE =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const LOGIN_URL = `${API_BASE}/api/auth/staff/login`;
const CSRF_URL = `${API_BASE}/api/auth/csrf-token`;
const SITE_KEY = "6LetyeErAAAAAFs98bq-wMIExs9omlZbPLWcd4FQ";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const navigate = useNavigate();

  /* ---------------------------------------
     🧰 Fetch CSRF token from backend
  --------------------------------------- */
  useEffect(() => {
    async function fetchCsrf() {
      try {
        const { data } = await axios.get(CSRF_URL, { withCredentials: true });
        if (data?.csrfToken) setCsrfToken(data.csrfToken);
      } catch (err) {
        console.warn("⚠️ CSRF token fetch failed:", err.message);
      }
    }
    fetchCsrf();
  }, []);

  /* ---------------------------------------
     🧰 Handle login
  --------------------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleanUsername = sanitizeInput(username);
    const cleanPassword = sanitizeInput(password);

    // ✅ Validation for username-based login
    if (!cleanUsername.trim()) {
      setError("Username is required");
      return;
    }
    if (cleanPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!captchaToken) {
      setError("Please complete the reCAPTCHA");
      return;
    }

    try {
      setLoading(true);

      const { data } = await axios.post(
        LOGIN_URL,
        {
          email: cleanUsername, // ✅ username is treated as email alias for backend
          password: cleanPassword,
          captcha: captchaToken,
          csrf: csrfToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          timeout: 10000,
          withCredentials: true,
        }
      );

      if (!data?.token || !data?.user) {
        setError("Invalid login response from server.");
        return;
      }

      // 🔐 Encrypt token
      const encryptedToken = btoa(data.token);
      localStorage.setItem("token", encryptedToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      const role = data.user.role?.toLowerCase();
      const service = data.user.service_type?.toLowerCase();

      if (role === "superadmin") navigate("/patients");
      else if (service) navigate(`/${service}/calendar`);
      else setError("Unauthorized or unknown service access.");
    } catch (err) {
      console.error("❌ Login error:", err);
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please check your credentials.";
      setError(String(message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Admin Login</h2>

        {/* ✅ Secure error display */}
        {error && <p className="error">{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Username input */}
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          {/* ✅ Password input with professional eye toggle */}
          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span
              className={`toggle-eye ${showPassword ? "active" : ""}`}
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </span>
          </div>

          {/* ✅ Google reCAPTCHA */}
          <div className="captcha-box">
            <ReCAPTCHA
              sitekey={SITE_KEY}
              onChange={(token) => setCaptchaToken(token)}
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="switch-link">
          Don’t have an account? <Link to="/register">Create one</Link>
        </p>
      </div>

      {/* ✅ Polished Styling */}
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
          background: #ffffff;
          padding: 45px 35px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
          width: 100%;
          max-width: 400px;
          text-align: center;
        }

        h2 {
          margin-bottom: 24px;
          color: #1f2937;
          font-size: 26px;
          font-weight: 700;
        }

        form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Unified input design */
        input {
          width: 100%;
          height: 44px;
          padding: 12px 14px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 16px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          background-color: #f9fafb;
          box-sizing: border-box;
        }

        input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
          background-color: #ffffff;
        }

        /* Password field with icon */
        .password-wrapper {
          position: relative;
          width: 100%;
        }

        .password-wrapper input {
          width: 100%;
          padding-right: 42px; /* Space for eye icon */
          box-sizing: border-box;
        }

        .toggle-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          cursor: pointer;
          color: #9ca3af;
          font-size: 20px;
          transition: color 0.2s ease;
        }

        .toggle-eye.active {
          color: #2563eb; /* Blue when active */
        }

        .toggle-eye:hover {
          color: #2563eb;
        }

        .captcha-box {
          display: flex;
          justify-content: center;
          margin-top: 5px;
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
          transition: all 0.25s ease;
          box-shadow: 0 3px 10px rgba(37, 99, 235, 0.2);
        }

        button:hover {
          background: #1e40af;
          box-shadow: 0 5px 15px rgba(30, 64, 175, 0.3);
        }

        .error {
          color: #dc2626;
          background: #fee2e2;
          border: 1px solid #fecaca;
          padding: 10px;
          border-radius: 6px;
          margin-bottom: 12px;
          font-size: 14px;
        }

        .switch-link {
          margin-top: 20px;
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
            padding: 35px 25px;
            max-width: 90%;
          }
          h2 {
            font-size: 22px;
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
