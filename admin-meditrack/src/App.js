// src/App.js
import React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";

import Patients from "./pages/Patients";
import Stock from "./pages/Stock";
import Prescriptions from "./pages/Prescriptions";
import AdminLogin from "./pages/AdminLogin";
import Register from "./pages/Register";
import Layout from "./Layout";
import ServiceCalendar from "./pages/ServiceCalendar";
import PatientDetails from "./pages/PatientDetails";
import "./App.css";

/* -------- RequireAuth wrapper -------- */
function RequireAuth({ children }) {
  const raw = localStorage.getItem("user");
  if (!raw) return <Navigate to="/admin" replace />;

  let user;
  try {
    user = JSON.parse(raw);
  } catch {
    return <Navigate to="/admin" replace />;
  }

  if (!user || !user.role) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

/* -------- Role Redirect -------- */
function RoleRedirect() {
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    user = {};
  }

  if (!user.role) return <Navigate to="/admin" replace />;

  // ✅ Superadmin → always Patients
  if (user.role.toLowerCase() === "superadmin") {
    return <Navigate to="/patients" replace />;
  }

  // ✅ Staff → goes to their service calendar
  if (user.role.toLowerCase() === "staff" && user.service_type) {
    return (
      <Navigate to={`/${user.service_type.toLowerCase()}/calendar`} replace />
    );
  }

  return <Navigate to="/admin" replace />;
}

/* -------- Main App -------- */
export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/register" element={<Register />} />

      {/* Default redirect based on role */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <RoleRedirect />
          </RequireAuth>
        }
      />

      {/* Protected routes with sidebar */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout>
              <Outlet />
            </Layout>
          </RequireAuth>
        }
      >
        {/* -------- Superadmin pages -------- */}
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetails />} />
        <Route path="prescriptions" element={<Prescriptions />} />
        <Route path="stock" element={<Stock />} />

        {/* -------- Staff pages (per service_type) -------- */}
        <Route path=":service/patients" element={<Patients />} />
        <Route path=":service/stock" element={<Stock />} />
        <Route path=":service/calendar" element={<ServiceCalendar />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
