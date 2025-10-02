// src/Layout.js
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user"));
  } catch (e) {
    user = null;
  }

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/admin");
  };

  if (!user) return null;

  return (
    <div className="app">
      {/* Mobile toggle */}
      <button
        className="menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo">MediTrack</div>
        <nav>
          {/* ✅ SUPERADMIN (global pages) */}
          {user.role?.toLowerCase() === "superadmin" && (
            <>
              <NavLink className="nav-item" to="/patients">
                Patients
              </NavLink>
           
              <NavLink className="nav-item" to="/stock">
                Stock
              </NavLink>
            </>
          )}

          {/* ✅ STAFF (service-specific pages) */}
          {["medical", "dental", "pt", "tb", "vax"].includes(
            user.role?.toLowerCase()
          ) && (
            <>
              <NavLink className="nav-item" to={`/${user.role}/patients`}>
                Patients
              </NavLink>
        
              <NavLink className="nav-item" to={`/${user.role}/stock`}>
                Stock
              </NavLink>
              <NavLink className="nav-item" to={`/${user.role}/calendar`}>
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)} Calendar
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <p>
            {user.name} ({user.role})
          </p>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">{children}</main>
    </div>
  );
}
