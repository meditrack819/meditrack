// src/Layout.js
import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user"));
  } catch {
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
      {/* Sidebar */}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="logo">
          MediTrack
          <button
            className="collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
          >
            <i className={`fas ${collapsed ? "fa-angle-right" : "fa-angle-left"}`}></i>
          </button>
        </div>

        <nav>
          {/* ✅ Superadmin links */}
          {user.role?.toLowerCase() === "superadmin" && (
            <>
              <NavLink className="nav-item" to="/patients">
                <i className="fas fa-users"></i> <span>Patients</span>
              </NavLink>
              <NavLink className="nav-item" to="/stock">
                <i className="fas fa-pills"></i> <span>Stock</span>
              </NavLink>
              <NavLink className="nav-item" to="/medical/calendar">
                <i className="fas fa-calendar-alt"></i> <span>Medical Calendar</span>
              </NavLink>
              <NavLink className="nav-item" to="/dental/calendar">
                <i className="fas fa-calendar-alt"></i> <span>Dental Calendar</span>
              </NavLink>
              <NavLink className="nav-item" to="/TBHIV/calendar">
                <i className="fas fa-calendar-alt"></i> <span>TB Calendar</span>
              </NavLink>
              <NavLink className="nav-item" to="/Vaccination/calendar">
                <i className="fas fa-calendar-alt"></i> <span>Vaccination Calendar</span> 
              </NavLink>           
              <NavLink className="nav-item" to="/PTP/calendar">
                <i className="fas fa-calendar-alt"></i> <span>PT Calendar</span>
              </NavLink>
            </>
          )}

          {/* ✅ Service staff links */}
          {user.role?.toLowerCase() === "staff" && user.service_type && (
            <>
              <NavLink className="nav-item" to={`/${user.service_type}/patients`}>
                <i className="fas fa-users"></i> <span>Patients</span>
              </NavLink>
              <NavLink className="nav-item" to={`/${user.service_type}/stock`}>
                <i className="fas fa-pills"></i> <span>Stock</span>
              </NavLink>
              <NavLink className="nav-item" to={`/${user.service_type}/calendar`}>
                <i className="fas fa-calendar-alt"></i> <span>{user.service_type} Calendar</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <p>{user.name} ({user.role})</p>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">{children}</main>
    </div>
  );
}
