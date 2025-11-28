import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    service_type: "medical",
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
      const url = `${API_BASE}/api/auth/staff/register`;
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

        if (role === "superadmin") navigate("/patients");
        else if (service) navigate(`/${service}/calendar`);
        else {
          setError(`Unauthorized or unknown service: ${service || "none"}`);
          navigate("/admin");
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
    <div className="auth-container">
      <div className="auth-card">
        <h2>🩺 Staff Registration</h2>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label>Full Name</label>
            <input
              type="text"
              name="name"
              placeholder="Enter full name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="field">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="Enter email address"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              name="password"
              placeholder="Create a password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="field">
            <label>Service Type</label>
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
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        <p className="footer-text">
          Already have an account? <Link to="/admin">Login</Link>
        </p>
      </div>

      <style>{`
        :root {
          --blue:#1e40af;
          --light-blue:#2563eb;
          --border:#e5e7eb;
          --bg:#f3f4f6;
          --card:#fff;
          --error:#dc2626;
          --success:#16a34a;
        }

        .auth-container {
          display:flex;
          align-items:center;
          justify-content:center;
          min-height:100vh;
          background:linear-gradient(135deg,#1e3a8a,#2563eb);
          padding:20px;
        }

        .auth-card {
          background:var(--card);
          padding:40px 32px;
          border-radius:18px;
          box-shadow:0 6px 25px rgba(0,0,0,0.1);
          width:100%;
          max-width:420px;
          text-align:center;
          animation:fadeIn .5s ease;
        }

        h2 {
          margin-bottom:20px;
          color:var(--blue);
          font-size:26px;
          font-weight:700;
        }

        form {
          display:flex;
          flex-direction:column;
          gap:18px;
        }

        .field {
          text-align:left;
          display:flex;
          flex-direction:column;
          gap:6px;
        }

        label {
          font-size:14px;
          color:#374151;
          font-weight:500;
        }

        input, select {
          padding:12px 14px;
          border:1px solid var(--border);
          border-radius:10px;
          font-size:15px;
          outline:none;
          transition:.3s;
        }

        input:focus, select:focus {
          border-color:var(--light-blue);
          box-shadow:0 0 0 3px rgba(37,99,235,0.15);
        }

        button {
          background:var(--light-blue);
          color:#fff;
          border:none;
          padding:12px;
          border-radius:10px;
          font-size:16px;
          font-weight:600;
          cursor:pointer;
          transition:.3s ease;
          margin-top:10px;
        }

        button:hover:not(:disabled) {
          background:var(--blue);
          transform:translateY(-1px);
        }

        button:disabled {
          opacity:0.7;
          cursor:not-allowed;
        }

        .error {
          color:var(--error);
          background:#fee2e2;
          border:1px solid #fecaca;
          padding:8px;
          border-radius:8px;
          margin-bottom:10px;
          font-size:14px;
        }

        .success {
          color:var(--success);
          background:#dcfce7;
          border:1px solid #bbf7d0;
          padding:8px;
          border-radius:8px;
          margin-bottom:10px;
          font-size:14px;
        }

        .footer-text {
          margin-top:18px;
          font-size:14px;
          color:#6b7280;
        }

        .footer-text a {
          color:var(--light-blue);
          font-weight:600;
          text-decoration:none;
        }

        .footer-text a:hover {
          text-decoration:underline;
        }

        /* ✅ Responsiveness */
        @media(max-width:480px){
          .auth-card {
            padding:28px 22px;
            max-width:340px;
          }
          h2 { font-size:22px; }
          input, select, button { font-size:15px; }
        }

        @keyframes fadeIn {
          from {opacity:0; transform:translateY(15px);}
          to {opacity:1; transform:translateY(0);}
        }
      `}</style>
    </div>
  );
}
