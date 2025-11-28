import React, { useEffect, useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* =========================================================
   ⚙️ API CONFIG
========================================================= */
const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";
const REPORT_API = `${API_BASE}/api/reports`;
const DOCTOR_API = `${API_BASE}/api/doctors`;

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const [filters, setFilters] = useState({
    type: "appointments",
    service_type: "all",
    doctor_id: "",
    start_date: "",
    end_date: "",
  });

  const showToast = (msg) => alert(msg);

  /* =========================================================
     🗓️ Default Date Range
  ========================================================= */
  useEffect(() => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];
    setFilters((f) => ({ ...f, start_date: first, end_date: last }));
  }, []);

  /* =========================================================
     👨‍⚕️ Load Doctors
  ========================================================= */
  useEffect(() => {
    const loadDoctors = async () => {
      try {
        if (
          filters.service_type === "all" ||
          (filters.type !== "appointments" && filters.type !== "availability")
        ) {
          setDoctors([]);
          setFilters((f) => ({ ...f, doctor_id: "" }));
          return;
        }
        const res = await axios.get(DOCTOR_API, {
          params: { service_type: filters.service_type },
        });
        setDoctors(res.data || []);
      } catch (err) {
        console.error("Error loading doctors:", err);
      }
    };
    loadDoctors();
  }, [filters.service_type, filters.type]);

/* =========================================================
   📊 Load Reports (Fixed + includes Doctors)
========================================================= */
const loadReports = async () => {
  try {
    setLoading(true);
    const { type, start_date, end_date, service_type, doctor_id } = filters;

    // 🩺 Match DoctorCalendar config
    const mapServiceType = (type) => {
      switch (type) {
        case "medical":
          return ["medical-general", "medical-buntis"];
        case "dental":
          return ["dental-bunot", "dental-pasta", "dental-buntis"];
        case "vaccination":
          return ["vax-children", "vax-adult"];
        case "pt":
          return ["pt"];
        case "tb":
          return ["tb"];
        default:
          return [type];
      }
    };

    // 👨‍⚕️ Special Case — Doctors Report (no filters or params)
    if (type === "doctors") {
      const res = await axios.get(`${DOCTOR_API}`);
      setReports(res.data || []);
      return; // ✅ Stop here (don’t run mapped service logic)
    }

    // 🧩 Fetch all relevant services for other report types
    const mappedTypes = mapServiceType(service_type);
    let allData = [];

    for (const st of mappedTypes) {
      const res = await axios.get(`${REPORT_API}/${type}`, {
        params: {
          start_date,
          end_date,
          service_type: st,
          doctor_id: doctor_id || undefined,
        },
      });
      allData = allData.concat(res.data || []);
    }

    setReports(allData);
  } catch (err) {
    console.error("❌ Error loading reports:", err);
    showToast("⚠️ Failed to load reports.");
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  if (filters.start_date && filters.end_date) loadReports();
}, [filters]);


/* =========================================================
   🧾 Generate PDF (with Stock Report Support)
========================================================= */
const generatePDF = (mode = "preview") => {
  if (!reports.length) return showToast("⚠️ No data to export.");

  const doc = new jsPDF({
    orientation: filters.type === "availability" ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  // ===== HEADER =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MediTrack Health Center", 105, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`${filters.type.toUpperCase()} REPORT`, 105, 22, { align: "center" });

  doc.setFontSize(9);
  doc.text(`Date Range: ${filters.start_date} to ${filters.end_date}`, 14, 32);

  // ===== TABLE DATA =====
  let headers = [];
  let body = [];

  if (filters.type === "appointments") {
    headers = [
      "Date",
      "Time",
      "Status",
      "Reason",
      "Service Type",
      "First Name",
      "Last Name",
      "Doctor Name",
    ];
    body = reports.map((r) => [
      new Date(r.date).toLocaleDateString(),
      r.time ? r.time.slice(0, 5) : "—",
      r.status || "—",
      r.reason || "—",
      r.service_type || "—",
      r.first_name || "—",
      r.last_name || "—",
      r.doctor_name || "—",
    ]);
  }

  else if (filters.type === "prescriptions") {
    headers = [
      "Date",
      "Patient",
      "Diagnosis",
      "Medication",
      "Prescribed Qty",
      "Dispensed Qty",
    ];
    body = reports.map((r) => [
      new Date(r.start_date).toLocaleDateString(),
      `${r.first_name || ""} ${r.last_name || ""}`,
      r.diagnosis || "—",
      r.medication_name || "—",
      r.prescribed_qty || "—",
      r.dispensed_qty || "—",
    ]);
  }

  else if (filters.type === "availability") {
    headers = ["Doctor", "Service", "Date", "From", "To", "Status", "Reason"];
    body = reports.map((r) => [
      r.doctor_name || "—",
      r.service_type || "—",
      new Date(r.date).toLocaleDateString(),
      r.start_time || "—",
      r.end_time || "—",
      r.status || "—",
      r.reason || "—",
    ]);
  }

  else if (filters.type === "patients") {
    headers = ["Patient", "Diagnosis", "Email", "Phone", "Address"];
    body = reports.map((r) => [
      `${r.first_name || ""} ${r.last_name || ""}`,
      r.diagnosis || "—",
      r.email || "—",
      r.phone || "—",
      `${r.city || ""}, ${r.barangay || ""}`,
    ]);
  }

  else if (filters.type === "doctors") {
  headers = ["Name", "Specialization", "Email"];
  body = reports.map((r) => [
    r.name || "—",
    r.specialization || "—",
    r.contact || "—",

  ]);
}


/* =========================================================
   📦 STOCK REPORT (Unified Design with KPIs)
========================================================= */
else if (filters.type === "stock") {
  headers = [
    "Medicine Name",
    "Quantity",
    "Expiration",
    "Last Updated",
    "Status",
  ];
  const totalItems = reports.length;
  const totalUnits = reports.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0),
    0
  );
  const zeroStock = reports.filter((r) => Number(r.quantity || 0) === 0).length;
  const lowStock = reports.filter(
    (r) => Number(r.quantity || 0) > 0 && Number(r.quantity) < 10
  ).length;

  // ✅ Summary cards (use same look across all reports)
  doc.setFont("helvetica", "bold");
  doc.text(" Inventory Summary", 14, 42);
  doc.setFont("helvetica", "normal");
  doc.text(`• Total Items: ${totalItems}`, 14, 48);
  doc.text(`• Total Units: ${totalUnits}`, 14, 53);
  doc.text(`• Low Stock (<10): ${lowStock}`, 14, 58);
  doc.text(`• Out of Stock: ${zeroStock}`, 14, 63);

  headers = [
    "Medicine Name",
    "Quantity",
    "Expiration",
    "Last Updated",
    "Status",
  ];
  body = reports.map((r) => [
    r.medicine_name || "—",
    r.quantity || 0,
    r.expiration_date
      ? new Date(r.expiration_date).toLocaleDateString()
      : "—",
    r.last_updated
      ? new Date(r.last_updated).toLocaleDateString()
      : "—",
    Number(r.quantity || 0) === 0
      ? "❌ Out of Stock"
      : Number(r.quantity || 0) < 10
      ? "⚠️ Low"
      : "✅ Available",
  ]);
}

  // ===== TABLE RENDER =====
  const startY = filters.type === "stock" ? 70 : 40;

  autoTable(doc, {
    startY,
    head: [headers],
    body,
    theme: "striped",
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
    },
    bodyStyles: { fontSize: 9, valign: "middle" },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    styles: { cellPadding: 3 },
    margin: { left: 10, right: 10 },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      const pageCount = doc.internal.getNumberOfPages();
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.getWidth() - 20,
        doc.internal.pageSize.getHeight() - 10
      );
    },
  });

  // ===== FOOTER =====
  doc.setFontSize(8);
  doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 285);

  // ===== OUTPUT =====
  const blobUrl = doc.output("bloburl");
  if (mode === "preview") {
    setPdfUrl(blobUrl);
    setShowPreview(true);
  } else if (mode === "download") {
    doc.save(`MediTrack_${filters.type}_Report.pdf`);
  } else if (mode === "print") {
    const win = window.open(blobUrl);
    win.onload = () => win.print();
  }
};


  /* =========================================================
     🖥️ UI
  ========================================================= */
  return (
    <div style={page}>
      <h2 style={title}>📊 Reports Dashboard</h2>

      {/* FILTER BAR */}
      <div style={filterCard}>
        <select
          style={dropdown}
          value={filters.type}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              type: e.target.value,
              doctor_id: "",
              service_type: "all",
            }))
          }
        >
          <option value="appointments">Appointments</option>
          <option value="prescriptions">Prescriptions</option>
          <option value="patients">Patients</option>
          <option value="stock">Stock / Inventory</option>
          <option value="availability">Doctor Availability</option>
          <option value="doctors">Doctors</option>
        </select>

        {(filters.type === "appointments" || filters.type === "availability") && (
          <select
            style={dropdown}
            value={filters.service_type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, service_type: e.target.value }))
            }
          >
            <option value="all">All Services</option>
            <option value="medical">Medical</option>
            <option value="dental">Dental</option>
            <option value="tb">TB/HIV</option>
            <option value="vaccination">Vaccination</option>
            <option value="pt">Physical Therapy</option>
          </select>
        )}

        {doctors.length > 0 && (
          <select
            style={dropdown}
            value={filters.doctor_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, doctor_id: e.target.value }))
            }
          >
            <option value="">All Doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}

        <input
          type="date"
          style={dateInput}
          value={filters.start_date}
          onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
        />
        <input
          type="date"
          style={dateInput}
          value={filters.end_date}
          onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
        />

        <button style={btnBlue} onClick={loadReports}>
          🔍 View
        </button>
        <button style={btnGray} onClick={() => generatePDF("preview")}>
          👁 Preview
        </button>
      </div>

      {/* TABLE */}
      <div style={tableCard}>
        {loading ? (
          <p>⏳ Loading...</p>
        ) : reports.length ? (
          <div style={{ overflowX: "auto", maxHeight: "65vh" }}>
            <table style={table}>
              <thead style={stickyHeader}>
                <tr>
                  {/* Header columns auto switch */}
                  {filters.type === "appointments" && (
                    <>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Reason</th>
                      <th>Service Type</th>
                      <th>First Name</th>
                      <th>Last Name</th>
                      <th>Doctor Name</th>
                    </>
                  )}
                  {filters.type === "prescriptions" && (
                    <>
                      <th>Date</th>
                      <th>Patient</th>
                      <th>Diagnosis</th>
                      <th>Medication</th>
                      <th>Prescribed Qty</th>
                      <th>Dispensed Qty</th>
                    </>
                  )}
                  {filters.type === "availability" && (
                    <>
                      <th>Doctor</th>
                      <th>Service</th>
                      <th>Date</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </>
                  )}
                  {filters.type === "patients" && (
                    <>
                      <th>Patient</th>
                      <th>Diagnosis</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Address</th>
                    </>
                  )}

                  {filters.type === "stock" && (
  <>
    <th>Medicine Name</th>
    <th>Quantity</th>
    <th>Expiration</th>
    <th>Last Updated</th>
    <th>Status</th>
  </>
)}

{filters.type === "doctors" && (
  <>
    <th>Name</th>
    <th>Specialization</th>
    <th>Email</th>
    <th>Phone</th>
  </>
)}


                </tr>
              </thead>
            <tbody>
  {reports.map((r, i) => {
    // 🎨 Dynamic background for stock table (low/out-of-stock highlight)
    let rowStyle = i % 2 === 0 ? { ...tableRow } : { ...tableRowAlt };
    if (filters.type === "stock") {
      const qty = Number(r.quantity || 0);
      if (qty === 0) {
        rowStyle = { ...rowStyle, background: "#fee2e2" }; // light red
      } else if (qty < 10) {
        rowStyle = { ...rowStyle, background: "#fef9c3" }; // light yellow
      }
    }

    return (
      <tr
        key={i}
        style={rowStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#eef2ff")}
        onMouseLeave={(e) =>
          (e.currentTarget.style.background =
            filters.type === "stock"
              ? Number(r.quantity || 0) === 0
                ? "#fee2e2"
                : Number(r.quantity || 0) < 10
                ? "#fef9c3"
                : i % 2 === 0
                ? "#ffffff"
                : "#f9fafb"
              : i % 2 === 0
              ? "#ffffff"
              : "#f9fafb")
        }
      >
        {/* 🩺 Appointments */}
        {filters.type === "appointments" && (
          <>
            <td style={tdStyle}>{new Date(r.date).toLocaleDateString()}</td>
            <td style={tdStyle}>{r.time ? r.time.slice(0, 5) : "—"}</td>
            <td style={{ ...tdStyle, color: "#1e40af", fontWeight: 600 }}>
              {r.status || "—"}
            </td>
            <td style={tdStyle}>{r.reason || "—"}</td>
            <td style={tdStyle}>{r.service_type || "—"}</td>
            <td style={tdStyle}>{r.first_name || "—"}</td>
            <td style={tdStyle}>{r.last_name || "—"}</td>
            <td style={tdStyle}>{r.doctor_name || "—"}</td>
          </>
        )}

        {/* 💊 Prescriptions */}
        {filters.type === "prescriptions" && (
          <>
            <td style={tdStyle}>
              {new Date(r.start_date).toLocaleDateString()}
            </td>
            <td style={tdStyle}>
              {`${r.first_name || ""} ${r.last_name || ""}`}
            </td>
            <td style={tdStyle}>{r.diagnosis || "—"}</td>
            <td style={tdStyle}>{r.medication_name || "—"}</td>
            <td style={tdStyle}>{r.prescribed_qty || "—"}</td>
            <td style={tdStyle}>{r.dispensed_qty || "—"}</td>
          </>
        )}

        {/* 🩺 Doctor Availability */}
        {filters.type === "availability" && (
          <>
            <td style={tdStyle}>{r.doctor_name || "—"}</td>
            <td style={tdStyle}>{r.service_type || "—"}</td>
            <td style={tdStyle}>{new Date(r.date).toLocaleDateString()}</td>
            <td style={tdStyle}>{r.start_time || "—"}</td>
            <td style={tdStyle}>{r.end_time || "—"}</td>
            <td style={tdStyle}>{r.status || "—"}</td>
            <td style={tdStyle}>{r.reason || "—"}</td>
          </>
        )}

        {/* 👩‍⚕️ Patients */}
        {filters.type === "patients" && (
          <>
            <td style={tdStyle}>
              {`${r.first_name || ""} ${r.last_name || ""}`}
            </td>
            <td style={tdStyle}>{r.diagnosis || "—"}</td>
            <td style={tdStyle}>{r.email || "—"}</td>
            <td style={tdStyle}>{r.phone || "—"}</td>
            <td style={tdStyle}>
              {`${r.city || ""}${r.barangay ? ", " + r.barangay : ""}`}
            </td>
          </>
        )}

        {/* 📦 Stock / Inventory */}
        {filters.type === "stock" && (
          <>
            <td style={tdStyle}>{r.medicine_name || "—"}</td>
            <td style={tdStyle}>{r.quantity || 0}</td>
            <td style={tdStyle}>
              {r.expiration_date
                ? new Date(r.expiration_date).toLocaleDateString()
                : "—"}
            </td>
            <td style={tdStyle}>
              {r.last_updated
                ? new Date(r.last_updated).toLocaleDateString()
                : "—"}
            </td>
            <td
              style={{
                ...tdStyle,
                color:
                  Number(r.quantity || 0) === 0
                    ? "#dc2626"
                    : Number(r.quantity || 0) < 10
                    ? "#b45309"
                    : "#16a34a",
                fontWeight: 600,
              }}
            >
              {Number(r.quantity || 0) === 0
                ? "Out of Stock"
                : Number(r.quantity || 0) < 10
                ? "Low"
                : "Available"}
            </td>
          </>
        )}

        {/* 👨‍⚕️ Doctors Report */}
        {filters.type === "doctors" && (
          <>
            <td style={tdStyle}>{r.name || "—"}</td>
            <td style={tdStyle}>{r.specialization || "—"}</td>
            <td style={tdStyle}>{r.service_type || "—"}</td>
            <td style={tdStyle}>{r.email || "—"}</td>
            <td style={tdStyle}>{r.phone || "—"}</td>
          </>
        )}
      </tr>
    );
  })}
</tbody>


            </table>
          </div>
        ) : (
          <p style={{ color: "gray" }}>No records found.</p>
        )}
      </div>

      {/* PDF PREVIEW */}
      {showPreview && (
        <div style={modalBackdrop}>
          <div style={modalBox}>
            <iframe
              src={pdfUrl}
              title="PDF Preview"
              style={{ flex: 1, border: "none", borderRadius: "8px" }}
            />
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button style={btnBlue} onClick={() => generatePDF("download")}>
                💾 Download
              </button>
              <button style={btnBlue} onClick={() => generatePDF("print")}>
                🖨 Print
              </button>
              <button style={btnGray} onClick={() => setShowPreview(false)}>
                ❌ Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   💅 STYLES
========================================================= */
const page = {
  padding: 24,
  background: "#f4f6fc",
  minHeight: "100vh",
};
const title = {
  color: "#1e3a8a",
  fontWeight: "700",
  marginBottom: 16,
  fontSize: "1.6rem",
};
const filterCard = {
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  background: "#fff",
  padding: "15px",
  borderRadius: "10px",
  boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  alignItems: "center",
  marginBottom: 20,
};
const dropdown = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontSize: "0.95rem",
  cursor: "pointer",
};
const dateInput = { ...dropdown };
const btnBlue = {
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  padding: "8px 14px",
  cursor: "pointer",
  fontWeight: 600,
  transition: "background 0.3s ease",
};
const btnGray = { ...btnBlue, background: "#6b7280" };
const tableCard = {
  background: "#fff",
  borderRadius: "14px",
  boxShadow: "0 3px 6px rgba(0,0,0,0.1)",
  padding: "18px",
};
const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: "0 6px",
  textAlign: "left",
  fontSize: "0.92rem",
};
const stickyHeader = {
  position: "sticky",
  top: 0,
  background: "#1e3a8a",
  color: "#fff",
  textAlign: "left",
  fontWeight: 600,
  letterSpacing: "0.3px",
  fontSize: "0.95rem",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  zIndex: 2,
};
const tableRow = {
  background: "#ffffff",
  borderRadius: "8px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  transition: "background 0.2s ease, transform 0.15s ease",
};
const tableRowAlt = {
  background: "#f9fafb",
  borderRadius: "8px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  transition: "background 0.2s ease, transform 0.15s ease",
};
const tdStyle = {
  padding: "12px 16px",
  borderBottom: "1px solid #e5e7eb",
  verticalAlign: "middle",
};
const modalBackdrop = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  background: "rgba(0,0,0,0.7)",
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const modalBox = {
  width: "85%",
  height: "85%",
  background: "#fff",
  borderRadius: "10px",
  padding: "15px",
  display: "flex",
  flexDirection: "column",
};
