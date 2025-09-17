// App.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, Outlet, useParams, useLocation } from 'react-router-dom';
import Patients from './pages/Patients';
import Calendar from './pages/Calendar';
import Stock from './pages/Stock';
import Prescriptions from './pages/Prescriptions';
import './App.css';

// Legacy bridge: /prescriptions/:id -> /patients/:patientId/manage
function LegacyPrescriptionsRedirect() {
  const { id } = useParams();
  return <Navigate to={`/patients/${id}/manage`} replace />;
}

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change when on mobile
  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) setSidebarOpen(false);
  }, [location.pathname]);

  // Close on ESC
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setSidebarOpen(false);
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      {/* Sidebar Navigation */}
      <aside
        className="sidebar"
        aria-label="Primary"
        aria-hidden={!sidebarOpen && window.matchMedia('(max-width: 768px)').matches}
        id="primary-sidebar"
      >
        <h2 className="logo">MediTrack</h2>
        <nav>
          <NavLink
            to="/patients"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            aria-label="Patients"
          >
            👥 Patients
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            aria-label="Calendar"
          >
            📅 Calendar
          </NavLink>
          <NavLink
            to="/stock"
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            aria-label="Stock"
          >
            📦 Stock
          </NavLink>
        </nav>
      </aside>

      {/* Mobile overlay (click to close) */}
      <button
        className={`backdrop ${sidebarOpen ? 'show' : ''}`}
        aria-hidden={!sidebarOpen}
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="main-content">
        <header className="topbar">
          <div className="left">
            {/* Hamburger only shows on mobile */}
            <button
              className="hamburger"
              aria-label="Toggle navigation"
              aria-controls="primary-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <span className="bar" />
              <span className="bar" />
              <span className="bar" />
            </button>
            <h1>Admin Dashboard</h1>
          </div>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* App shell */}
      <Route element={<Layout />}>
        {/* Redirect / → /patients */}
        <Route path="/" element={<Navigate to="/patients" replace />} />

        {/* Real pages */}
        <Route path="/patients" element={<Patients />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/stock" element={<Stock />} />

        {/* Manage prescriptions for a specific patient */}
        <Route path="/patients/:patientId/manage" element={<Prescriptions />} />

        {/* Legacy route support: redirect to new path */}
        <Route path="/prescriptions/:id" element={<LegacyPrescriptionsRedirect />} />

        {/* Catch-all → /patients */}
        <Route path="*" element={<Navigate to="/patients" replace />} />
      </Route>
    </Routes>
  );
}
