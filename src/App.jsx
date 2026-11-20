
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:8080/api/complaints";

const EMPTY_STATS = {
  total: 0,
  pending: 0,
  underReview: 0,
  inProgress: 0,
  resolved: 0,
};

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
];

function formatStatus(status = "") {
  return status
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readResponse(response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(
        message || `Request failed with status ${response.status}`
    );
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function StatCard({ label, value, icon, tone }) {
  return (
      <div className={`stat-card ${tone}`}>
        <div className="stat-card-top">
          <span className="stat-label">{label}</span>
          <span className="stat-icon" aria-hidden="true">{icon}</span>
        </div>
        <div className="stat-value">{value}</div>
        <div className="stat-caption">Current complaint count</div>
      </div>
  );
}

function App() {
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [activePage, setActivePage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [busyId, setBusyId] = useState(null);

  const [officerNames, setOfficerNames] = useState({});
  const [resolutionTexts, setResolutionTexts] = useState({});
  const [openResolutionId, setOpenResolutionId] = useState(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [complaintsResponse, statsResponse] = await Promise.all([
        fetch(API_BASE),
        fetch(`${API_BASE}/stats`),
      ]);

      const complaintsData = await readResponse(complaintsResponse);
      const statsData = await readResponse(statsResponse);

      if (!Array.isArray(complaintsData)) {
        throw new Error("The complaints API did not return a list.");
      }

      setComplaints(complaintsData);
      setStats({
        total: Number(statsData?.total ?? complaintsData.length),
        pending: Number(statsData?.pending ?? 0),
        underReview: Number(statsData?.underReview ?? 0),
        inProgress: Number(statsData?.inProgress ?? 0),
        resolved: Number(statsData?.resolved ?? 0),
      });
    } catch (err) {
      setError(
          `Could not load dashboard data. ${err.message || "Please try again."}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const categories = useMemo(
      () => [...new Set(complaints.map((item) => item.category).filter(Boolean))],
      [complaints]
  );

  const filteredComplaints = useMemo(() => {
    const query = search.trim().toLowerCase();

    return complaints.filter((complaint) => {
      const matchesSearch =
          !query ||
          [
            complaint.title,
            complaint.description,
            complaint.location,
            complaint.category,
            complaint.assignedOfficer,
            String(complaint.id),
          ].some((value) => String(value ?? "").toLowerCase().includes(query));

      const matchesStatus =
          statusFilter === "ALL" || complaint.status === statusFilter;

      const matchesCategory =
          categoryFilter === "ALL" || complaint.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [complaints, search, statusFilter, categoryFilter]);

  async function updateStatus(id, status) {
    setBusyId(id);
    setError("");
    setNotice("");

    try {
      const url = `${API_BASE}/${id}/status?status=${encodeURIComponent(status)}`;
      await readResponse(
          await fetch(url, { method: "PUT" })
      );

      setNotice(`Complaint #${id} status updated to ${formatStatus(status)}.`);
      await loadDashboard(true);
    } catch (err) {
      setError(`Could not update status: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function assignOfficer(id) {
    const officerName = (officerNames[id] ?? "").trim();

    if (!officerName) {
      setError("Enter an officer name before assigning the complaint.");
      setNotice("");
      return;
    }

    setBusyId(id);
    setError("");
    setNotice("");

    try {
      const url = `${API_BASE}/${id}/assign?officerName=${encodeURIComponent(officerName)}`;
      await readResponse(
          await fetch(url, { method: "PUT" })
      );

      setNotice(`Complaint #${id} assigned to ${officerName}.`);
      await loadDashboard(true);
    } catch (err) {
      setError(`Could not assign officer: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function resolveComplaint(id) {
    const resolutionDetails = (resolutionTexts[id] ?? "").trim();

    if (!resolutionDetails) {
      setError("Enter resolution details before resolving the complaint.");
      setNotice("");
      return;
    }

    setBusyId(id);
    setError("");
    setNotice("");

    try {
      await readResponse(
          await fetch(`${API_BASE}/${id}/resolve`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resolutionDetails }),
          })
      );

      setNotice(`Complaint #${id} marked as resolved.`);
      setOpenResolutionId(null);
      await loadDashboard(true);
    } catch (err) {
      setError(
          `Could not resolve complaint. Check that the backend has the PUT /${id}/resolve endpoint. ${err.message}`
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">C</div>
            <div>
              <div className="brand-name">CivicCare</div>
              <div className="brand-subtitle">Citizen Services</div>
            </div>
          </div>


          <div className="sidebar-section-label">WORKSPACE</div>

          <div
              className={`sidebar-link ${activePage === "dashboard" ? "active" : ""}`}
              onClick={() => setActivePage("dashboard")}
              role="button"
              tabIndex={0}
          >
            <span className="nav-icon">▦</span>
            Dashboard
          </div>

          <div
              className={`sidebar-link ${activePage === "complaints" ? "active" : ""}`}
              onClick={() => setActivePage("complaints")}
              role="button"
              tabIndex={0}
          >
            <span className="nav-icon">▤</span>
            Complaints
            <span className="nav-count">{stats.total}</span>
          </div>

          <div className="sidebar-section-label sidebar-spaced">MANAGEMENT</div>

          <div
              className={`sidebar-link ${activePage === "officers" ? "active" : ""}`}
              onClick={() => setActivePage("officers")}
              role="button"
              tabIndex={0}
          >
            <span className="nav-icon">♙</span>
            Officers
          </div>

          <div
              className={`sidebar-link ${activePage === "resolutions" ? "active" : ""}`}
              onClick={() => setActivePage("resolutions")}
              role="button"
              tabIndex={0}
          >
            <span className="nav-icon">◷</span>
            Resolution Tracking
          </div>

          <div className="sidebar-bottom">
            <div className="sidebar-status-dot" />
            <div>
              <div className="sidebar-status-title">Backend connection</div>
              <div className="sidebar-status-text">localhost:8080</div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <span>/</span>
              <strong>
                {{
                  dashboard: "Dashboard",
                  complaints: "Complaints",
                  officers: "Officers",
                  resolutions: "Resolution Tracking",
                }[activePage]}
              </strong>

            </div>
            <div className="admin-profile">
              <div className="profile-avatar">A</div>
              <div>
                <div className="profile-name">Administrator</div>
                <div className="profile-role">CivicCare Admin</div>
              </div>
            </div>
          </header>

          <section className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">CITIZEN SERVICES PORTAL</div>

                <h1>
                  {{
                    dashboard: "Admin Dashboard",
                    complaints: "Complaint Management",
                    officers: "Officers Management",
                    resolutions: "Resolution Tracking",
                  }[activePage]}
                </h1>

                <p className="page-description">
                  Monitor, assign, and resolve public grievances from one place.
                </p>
              </div>
              <button
                  className="button button-primary"
                  onClick={() => loadDashboard(true)}
                  disabled={loading || refreshing}
              >
              <span className={refreshing ? "refresh-icon spinning" : "refresh-icon"}>
                ↻
              </span>
                {refreshing ? "Refreshing..." : "Refresh data"}
              </button>
            </div>

            {error && (
                <div className="alert alert-error" role="alert">
                  <span>!</span>
                  <div>{error}</div>
                  <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
                </div>
            )}

            {notice && (
                <div className="alert alert-success" role="status">
                  <span>✓</span>
                  <div>{notice}</div>
                  <button onClick={() => setNotice("")} aria-label="Dismiss message">×</button>
                </div>
            )}
            {activePage === "dashboard" && (
                <>
            <div className="section-heading">
              <div>
                <h2>Overview</h2>
                <p>Current status of all submitted complaints</p>
              </div>
              <span className="live-label"><span /> Live data</span>
            </div>

            <div className="stats-grid">
              <StatCard label="Total Complaints" value={stats.total} icon="▤" tone="tone-purple" />
              <StatCard label="Pending" value={stats.pending} icon="◷" tone="tone-amber" />
              <StatCard label="Under Review" value={stats.underReview} icon="◎" tone="tone-blue" />
              <StatCard label="In Progress" value={stats.inProgress} icon="↗" tone="tone-cyan" />
              <StatCard label="Resolved" value={stats.resolved} icon="✓" tone="tone-green" />
            </div>
                </>
            )}
            {activePage === "complaints" && (
            <section className="complaints-panel">
              <div className="panel-heading">
                <div>
                  <h2>Complaint Management</h2>
                  <p>Review complaint details and take action</p>
                </div>
                <span className="result-count">
                {filteredComplaints.length} of {complaints.length} complaints
              </span>
              </div>

              <div className="filters">
                <label className="search-box">
                  <span>⌕</span>
                  <input
                      type="search"
                      placeholder="Search title, ID, location, officer..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                  />
                </label>

                <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="ALL">All statuses</option>
                  {STATUS_OPTIONS.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                  ))}
                </select>

                <select
                    aria-label="Filter by category"
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {loading ? (
                  <div className="empty-state">
                    <div className="loader" />
                    <p>Loading complaints from CivicCare...</p>
                  </div>
              ) : filteredComplaints.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">▤</div>
                    <h3>No complaints found</h3>
                    <p>Try changing the search text or filters.</p>
                  </div>
              ) : (
                  <div className="table-scroll">
                    <table className="complaints-table">
                      <thead>
                      <tr>
                        <th>COMPLAINT</th>
                        <th>CATEGORY / LOCATION</th>
                        <th>ASSIGNED OFFICER</th>
                        <th>STATUS</th>
                        <th>SUBMITTED</th>
                        <th>ACTIONS</th>
                      </tr>
                      </thead>
                      <tbody>
                      {filteredComplaints.map((complaint) => (
                          <tr key={complaint.id}>
                            <td className="complaint-cell">
                              <div className="complaint-id">CC-{String(complaint.id).padStart(4, "0")}</div>
                              <div className="complaint-title">{complaint.title || "Untitled complaint"}</div>
                              <div className="complaint-description">
                                {complaint.description || "No description provided"}
                              </div>
                              {complaint.resolutionDetails && (
                                  <div className="resolution-note">
                                    <strong>Resolution:</strong> {complaint.resolutionDetails}
                                  </div>
                              )}
                            </td>

                            <td>
                              <div className="category-text">{complaint.category || "Other"}</div>
                              <div className="location-text">⌖ {complaint.location || "Not specified"}</div>
                            </td>

                            <td>
                              <div className="officer-editor">
                                <input
                                    value={officerNames[complaint.id] ?? complaint.assignedOfficer ?? ""}
                                    onChange={(event) =>
                                        setOfficerNames((current) => ({
                                          ...current,
                                          [complaint.id]: event.target.value,
                                        }))
                                    }
                                    placeholder="Officer name"
                                    aria-label={`Officer for complaint ${complaint.id}`}
                                />
                                <button
                                    className="button button-small"
                                    onClick={() => assignOfficer(complaint.id)}
                                    disabled={busyId === complaint.id}
                                >
                                  Assign
                                </button>
                              </div>
                            </td>

                            <td>
                          <span className={`status-badge status-${(complaint.status || "PENDING").toLowerCase()}`}>
                            <span />
                            {formatStatus(complaint.status || "PENDING")}
                          </span>
                              <select
                                  className="status-select"
                                  aria-label={`Change status for complaint ${complaint.id}`}
                                  value={complaint.status || "PENDING"}
                                  disabled={busyId === complaint.id}
                                  onChange={(event) => updateStatus(complaint.id, event.target.value)}
                              >
                                {STATUS_OPTIONS.map((status) => (
                                    <option key={status.value} value={status.value}>
                                      {status.label}
                                    </option>
                                ))}
                              </select>
                            </td>

                            <td className="date-cell">{formatDate(complaint.createdAt)}</td>

                            <td>
                              <button
                                  className="button button-resolve"
                                  disabled={busyId === complaint.id || complaint.status === "RESOLVED"}
                                  onClick={() => {
                                    setOpenResolutionId(
                                        openResolutionId === complaint.id ? null : complaint.id
                                    );
                                    setResolutionTexts((current) => ({
                                      ...current,
                                      [complaint.id]: current[complaint.id] ?? complaint.resolutionDetails ?? "",
                                    }));
                                  }}
                              >
                                {complaint.status === "RESOLVED" ? "Resolved" : "Resolve"}
                              </button>
                            </td>
                          </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
              )}

              {openResolutionId !== null && (
                  <div className="resolution-form">
                    <div>
                      <h3>Resolve complaint #{openResolutionId}</h3>
                      <p>Add a short note describing the action taken to resolve the issue.</p>
                    </div>
                    <textarea
                        rows={3}
                        value={resolutionTexts[openResolutionId] ?? ""}
                        onChange={(event) =>
                            setResolutionTexts((current) => ({
                              ...current,
                              [openResolutionId]: event.target.value,
                            }))
                        }
                        placeholder="Example: Road repair has been completed and inspected..."
                    />
                    <div className="resolution-actions">
                      <button
                          className="button"
                          onClick={() => setOpenResolutionId(null)}
                      >
                        Cancel
                      </button>
                      <button
                          className="button button-primary"
                          disabled={busyId === openResolutionId}
                          onClick={() => resolveComplaint(openResolutionId)}
                      >
                        {busyId === openResolutionId ? "Saving..." : "Save & Resolve"}
                      </button>
                    </div>
                  </div>
              )}

              <div className="panel-footer">
                <span>Showing live data from the CivicCare backend</span>
                <span>API: /api/complaints</span>
              </div>
            </section>
            )}
            {activePage === "officers" && (
                <section className="complaints-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Officers Management</h2>
                      <p>Officers assigned to public complaints</p>
                    </div>
                  </div>

                  {(() => {
                    const officers = {};

                    complaints.forEach((complaint) => {
                      const name = complaint.assignedOfficer?.trim();

                      if (name) {
                        if (!officers[name]) {
                          officers[name] = [];
                        }
                        officers[name].push(complaint);
                      }
                    });

                    const names = Object.keys(officers).sort();

                    if (names.length === 0) {
                      return (
                          <div className="empty-state">
                            <h3>No assigned officers yet</h3>
                            <p>Assign an officer from the Complaints page first.</p>
                          </div>
                      );
                    }

                    return (
                        <div className="table-scroll">
                          <table className="complaints-table">
                            <thead>
                            <tr>
                              <th>OFFICER NAME</th>
                              <th>ASSIGNED COMPLAINTS</th>
                              <th>IN PROGRESS</th>
                              <th>RESOLVED</th>
                            </tr>
                            </thead>
                            <tbody>
                            {names.map((name) => (
                                <tr key={name}>
                                  <td>{name}</td>
                                  <td>{officers[name].length}</td>
                                  <td>
                                    {officers[name].filter(
                                        (c) => c.status === "IN_PROGRESS"
                                    ).length}
                                  </td>
                                  <td>
                                    {officers[name].filter(
                                        (c) => c.status === "RESOLVED"
                                    ).length}
                                  </td>
                                </tr>
                            ))}
                            </tbody>
                          </table>
                        </div>
                    );
                  })()}
                </section>
            )}

            {activePage === "resolutions" && (
                <section className="complaints-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Resolution Tracking</h2>
                      <p>Resolved complaints and their resolution details</p>
                    </div>

                    <span className="result-count">
        {complaints.filter((c) => c.status === "RESOLVED").length} resolved
      </span>
                  </div>

                  {(() => {
                    const resolved = complaints.filter(
                        (c) => c.status === "RESOLVED"
                    );

                    if (resolved.length === 0) {
                      return (
                          <div className="empty-state">
                            <h3>No resolved complaints yet</h3>
                            <p>Resolved complaints will appear here.</p>
                          </div>
                      );
                    }

                    return (
                        <div className="table-scroll">
                          <table className="complaints-table">
                            <thead>
                            <tr>
                              <th>COMPLAINT</th>
                              <th>CATEGORY / LOCATION</th>
                              <th>ASSIGNED OFFICER</th>
                              <th>RESOLUTION DETAILS</th>
                              <th>LAST UPDATED</th>
                            </tr>
                            </thead>

                            <tbody>
                            {resolved.map((c) => (
                                <tr key={c.id}>
                                  <td>
                                    <div className="complaint-id">
                                      CC-{String(c.id).padStart(4, "0")}
                                    </div>
                                    <div className="complaint-title">{c.title}</div>
                                  </td>

                                  <td>
                                    <div className="category-text">
                                      {c.category || "Other"}
                                    </div>
                                    <div className="location-text">
                                      {c.location || "Not specified"}
                                    </div>
                                  </td>

                                  <td>{c.assignedOfficer || "Not assigned"}</td>

                                  <td>
                                    {c.resolutionDetails ||
                                        "No resolution details recorded"}
                                  </td>

                                  <td>{formatDate(c.updatedAt || c.createdAt)}</td>
                                </tr>
                            ))}
                            </tbody>
                          </table>
                        </div>
                    );
                  })()}
                </section>
            )}

            <footer className="page-footer">
              <span>© 2026 CivicCare — Online Public Grievance Management System</span>
              <span>Built for better citizen services</span>
            </footer>
          </section>
        </main>
      </div>
  );
}

export default App;
