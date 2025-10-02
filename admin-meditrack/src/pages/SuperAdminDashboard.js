// src/pages/SuperAdminDashboard.js
import React from "react";
import Patients from "./Patients";
import Stock from "./Stock";
import ServiceCalendar from "./ServiceCalendar";

export default function SuperAdminDashboard() {
  return (
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: "bold", marginBottom: "20px" }}>
        Admin Dashboard
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "10px" }}>Patients</h2>
          <Patients />
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "10px" }}>Stock</h2>
          <Stock />
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "12px", gridColumn: "span 2" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "10px" }}>Calendar</h2>
          <ServiceCalendar />
        </div>
      </div>
    </div>
  );
}
