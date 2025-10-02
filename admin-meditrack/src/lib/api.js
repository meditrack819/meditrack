import axios from "axios";

// Backend base URL (e.g. http://localhost:5000 or https://yourdomain.com)
const BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

// API prefix (default "/api")
const PREFIX = process.env.REACT_APP_API_PREFIX || "/api";

// Final API root
export const API_BASE = `${BASE}${PREFIX}`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false, // set true if you ever use cookies
});

// ✅ Automatically attach token if stored
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Optional: handle expired tokens globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn("⚠️ Unauthorized, redirecting to login...");
      // Example: clear token + redirect
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
