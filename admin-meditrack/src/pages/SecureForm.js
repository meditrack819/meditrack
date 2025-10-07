import React, { useState, useEffect } from "react";
import axios from "axios";
import ReCAPTCHA from "react-google-recaptcha";
import { sanitizeInput, validateInput } from "../utils/validate";

/* ---------- CONFIG ---------- */
const API =
  process.env.REACT_APP_BACKEND_URL ||
  "https://meditrack.space/admin"; // Must be HTTPS
const SITE_KEY = "6LfeHOErAAAAAMfyt2Xui3xBGy5Djw3snxx6kQwb"; // 👈 Replace with your real one

export default function SecureForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [csrfToken, setCsrfToken] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState(false);

  /* -------------------------------------------------------
     Generate CSRF token (random) — changes every load
  ------------------------------------------------------- */
  useEffect(() => {
    const random = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))
    );
    setCsrfToken(random);
  }, []);

  /* -------------------------------------------------------
     Input change handler (auto sanitize)
  ------------------------------------------------------- */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: sanitizeInput(value) }));
  };

  /* -------------------------------------------------------
     Validation
  ------------------------------------------------------- */
  const validateForm = () => {
    if (!validateInput("name", form.name)) {
      alert("⚠️ Invalid name — letters and spaces only");
      return false;
    }
    if (!validateInput("email", form.email)) {
      alert("⚠️ Invalid email format");
      return false;
    }
    if (!validateInput("phone", form.phone)) {
      alert("⚠️ Phone must start with 09 and have 11 digits");
      return false;
    }
    if (!validateInput("password", form.password)) {
      alert("⚠️ Password must be at least 6 characters");
      return false;
    }
    if (!captchaToken) {
      alert("⚠️ Please complete the reCAPTCHA");
      return false;
    }
    return true;
  };

  /* -------------------------------------------------------
     Submit
  ------------------------------------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setLoading(true);

      const token = localStorage.getItem("auth_token");

      const res = await axios.post(
        `${API}/secure-endpoint`,
        {
          ...form,
          csrf: csrfToken,
          captcha: captchaToken,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          timeout: 8000,
        }
      );

      alert(`✅ Submitted securely: ${res.data.message || "OK"}`);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to submit — please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------------------------------------
     UI
  ------------------------------------------------------- */
  return (
    <div
      style={{
        maxWidth: 420,
        margin: "40px auto",
        padding: "20px",
        border: "1px solid #ccc",
        borderRadius: "12px",
        background: "#fff",
        boxShadow: "0 3px 8px rgba(0,0,0,0.1)",
      }}
    >
      <h2 style={{ textAlign: "center" }}>Secure Form 🛡️</h2>
      <form onSubmit={handleSubmit} autoComplete="off">
        <label>Name</label>
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          required
        />

        <label>Email</label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          required
        />

        <label>Phone (09xxxxxxxxx)</label>
        <input
          type="text"
          name="phone"
          value={form.phone}
          onChange={handleChange}
          required
        />

        <label>Password</label>
        <input
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          required
        />

        {/* CAPTCHA */}
        <div style={{ marginTop: "12px", display: "flex", justifyContent: "center" }}>
          <ReCAPTCHA
            sitekey={SITE_KEY}
            onChange={(token) => setCaptchaToken(token)}
            theme="light"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "20px",
            width: "100%",
            padding: "10px",
            background: loading ? "#888" : "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Submitting..." : "Submit Securely"}
        </button>
      </form>
    </div>
  );
}
