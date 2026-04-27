import { useEffect, useRef, useState } from "react";
import { authFetch, getToken } from "../api.js";

const API = (import.meta.env.VITE_API_URL || "/api") + "/resume";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SkillTag({ label }) {
  return (
    <span style={{
      background: "#ede9fe", color: "#5b21b6",
      fontSize: 11, padding: "2px 7px", borderRadius: 4, display: "inline-block", margin: "1px 2px",
    }}>{label}</span>
  );
}

function Badge({ text, color }) {
  const colors = {
    green:  { background: "#dcfce7", color: "#166534" },
    blue:   { background: "#dbeafe", color: "#1e40af" },
    yellow: { background: "#fef9c3", color: "#854d0e" },
    gray:   { background: "#f3f4f6", color: "#374151" },
  };
  const s = colors[color] || colors.gray;
  return (
    <span style={{
      ...s, fontSize: 11, fontWeight: 600,
      padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

function visaColor(v) {
  if (!v) return "gray";
  if (v === "USC" || v === "GC") return "green";
  if (v === "H1B" || v === "OPT" || v === "CPT" || v === "TN" || v === "EAD") return "blue";
  return "gray";
}

function availColor(v) {
  if (v === "Immediate") return "green";
  if (v === "2 weeks") return "yellow";
  return "gray";
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label, accent }) {
  return (
    <div className="stat-card" style={accent ? {} : {}}>
      <div className="label">{label}</div>
      <div className="value" style={accent ? { color: "#6366f1" } : {}}>{value}</div>
    </div>
  );
}

function QueueItem({ item }) {
  const statusColors = {
    pending:   { bg: "#dbeafe", color: "#1e40af" },
    uploading: { bg: "#dcfce7", color: "#166534" },
    done:      { bg: "#dcfce7", color: "#166534" },
    error:     { bg: "#fee2e2", color: "#991b1b" },
    skipped:   { bg: "#fef9c3", color: "#854d0e" },
  };
  const sc = statusColors[item.status] || statusColors.pending;
  return (
    <div style={{
      background: "#f9fafb", border: "1px solid #e5e7eb",
      borderRadius: 8, padding: "10px 14px", marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a2e", maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.filename}
        </span>
        <span style={{ ...sc, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>
          {item.label}
        </span>
      </div>
      <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${item.progress}%`, background: item.status === "error" ? "#ef4444" : "#6366f1", borderRadius: 2, transition: "width .3s" }} />
      </div>
    </div>
  );
}

function CandidateModal({ candidate, onClose, onDeleted, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    expected_rate: candidate.expected_rate || "",
    visa_status: candidate.visa_status || "Unknown",
    availability: candidate.availability || "Unknown",
    current_title: candidate.current_title || "",
    location: candidate.location || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updates = {};
      Object.entries(form).forEach(([k, v]) => { if (v) updates[k] = v; });
      const r = await authFetch(`${API}/candidates/${candidate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!r.ok) throw new Error("Save failed");
      onUpdated();
      setEditing(false);
    } catch {
      alert("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${candidate.name || "this candidate"}?`)) return;
    setDeleting(true);
    try {
      const r = await authFetch(`${API}/candidates/${candidate.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      onDeleted();
    } catch {
      alert("Failed to delete.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{candidate.name || "Candidate"}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!editing ? (
            <>
              <div className="detail-grid">
                {[
                  ["Email",        candidate.email],
                  ["Phone",        candidate.phone],
                  ["Location",     candidate.location],
                  ["Visa",         candidate.visa_status],
                  ["Availability", candidate.availability],
                  ["Rate",         candidate.expected_rate],
                  ["Title",        candidate.current_title],
                  ["Uploaded",     fmt(candidate.uploaded_at)],
                ].map(([label, value]) => (
                  <div key={label} className="detail-field">
                    <span className="detail-label">{label}</span>
                    <span className={`detail-value ${!value ? "empty" : ""}`}>{value || "—"}</span>
                  </div>
                ))}
              </div>
              {candidate.skills?.length > 0 && (
                <div>
                  <div className="detail-label" style={{ marginBottom: 6 }}>Skills</div>
                  <div>{candidate.skills.map((s) => <SkillTag key={s} label={s} />)}</div>
                </div>
              )}
              {candidate.summary && (
                <div>
                  <div className="detail-label" style={{ marginBottom: 6 }}>Summary</div>
                  <div className="desc-box">{candidate.summary}</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["Expected Rate", "expected_rate", "text", "e.g. $75/hr"],
                ["Current Title", "current_title", "text", "e.g. Senior Java Developer"],
                ["Location",      "location",      "text", "e.g. Dallas, TX"],
              ].map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none" }}
                  />
                </div>
              ))}
              {[
                ["Visa Status",  "visa_status",  ["H1B","GC","USC","OPT","CPT","TN","EAD","Unknown"]],
                ["Availability", "availability", ["Immediate","2 weeks","1 month","Unknown"]],
              ].map(([label, key, opts]) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>{label}</label>
                  <select
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", background: "#fff" }}
                  >
                    {opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {!editing ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
              <button className="btn" style={{ background: "#fee2e2", color: "#991b1b" }} onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ResumeUpload() {
  const [tab, setTab] = useState("upload");

  // upload tab state
  const [queue, setQueue]   = useState([]);
  const [stats, setStats]   = useState(null);
  const dropRef             = useRef(null);

  // candidates tab state
  const [candidates, setCandidates] = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search,     setSearch]     = useState("");
  const [query,      setQuery]      = useState("");
  const [visaFilter, setVisaFilter] = useState("");
  const [availFilter, setAvailFilter] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [selected,   setSelected]   = useState(null);

  // ── stats ──────────────────────────────────────────────────
  async function loadStats() {
    try {
      const r = await authFetch(`${API}/stats`);
      if (!r.ok) return;
      setStats(await r.json());
    } catch { /* ignore */ }
  }

  useEffect(() => { loadStats(); }, []);

  // ── upload ─────────────────────────────────────────────────
  function handleFiles(files) {
    const docx = [...files].filter((f) => f.name.toLowerCase().endsWith(".docx"));
    if (!docx.length) { alert("Only .docx files are supported."); return; }
    docx.forEach(uploadFile);
  }

  function uploadFile(file) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entry = { id, filename: file.name, status: "uploading", label: "Uploading…", progress: 10 };
    setQueue((q) => [entry, ...q]);

    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setQueue((q) => q.map((i) => i.id === id ? { ...i, progress: Math.round(e.loaded / e.total * 80) } : i));
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const d = JSON.parse(xhr.responseText);
        const name = d.candidate?.name || "Saved";
        setQueue((q) => q.map((i) => i.id === id ? { ...i, status: "done", label: `✓ ${name} [${d.parser_used}]`, progress: 100 } : i));
        loadStats();
      } else {
        let msg = "Error";
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch { /* */ }
        setQueue((q) => q.map((i) => i.id === id ? { ...i, status: "error", label: `✗ ${msg}`, progress: 0 } : i));
      }
    };
    xhr.onerror = () => {
      setQueue((q) => q.map((i) => i.id === id ? { ...i, status: "error", label: "✗ Network error", progress: 0 } : i));
    };
    xhr.send(fd);
  }

  // drag-and-drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const over = (e) => { e.preventDefault(); el.style.borderColor = "#6366f1"; };
    const leave = () => { el.style.borderColor = "#e5e7eb"; };
    const drop = (e) => { e.preventDefault(); leave(); handleFiles(e.dataTransfer.files); };
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => { el.removeEventListener("dragover", over); el.removeEventListener("dragleave", leave); el.removeEventListener("drop", drop); };
  });

  // ── candidates ─────────────────────────────────────────────
  async function loadCandidates(pg = page) {
    setLoadingList(true);
    const params = new URLSearchParams({ page: pg, limit: 20 });
    if (query)       params.set("search", query);
    if (visaFilter)  params.set("visa", visaFilter);
    if (availFilter) params.set("availability", availFilter);
    try {
      const r = await authFetch(`${API}/candidates?${params}`);
      const d = await r.json();
      setCandidates(d.candidates || []);
      setTotal(d.total || 0);
      setTotalPages(Math.ceil((d.total || 0) / 20) || 1);
      setPage(pg);
    } catch { /* ignore */ }
    finally { setLoadingList(false); }
  }

  useEffect(() => {
    if (tab === "candidates") loadCandidates(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, visaFilter, availFilter]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setQuery(search);
  }

  // ── render ─────────────────────────────────────────────────
  const uscGc = stats?.visa_breakdown?.filter((v) => v.visa === "USC" || v.visa === "GC").reduce((s, v) => s + v.count, 0) ?? "—";
  const h1b   = stats?.visa_breakdown?.find((v) => v.visa === "H1B")?.count ?? "—";

  return (
    <>
      {/* Stats row */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <StatCard accent label="Total Candidates" value={stats?.total_candidates ?? "—"} />
        <StatCard label="USC / GC"  value={uscGc} />
        <StatCard label="H1B"       value={h1b} />
        <StatCard label="Top Skill" value={stats?.top_skills?.[0]?.skill ?? "—"} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e5e7eb" }}>
        {[["upload", "Upload"], ["candidates", "Candidates"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "9px 20px", fontSize: 14, fontWeight: 600, border: "none",
              background: "none", cursor: "pointer", color: tab === id ? "#6366f1" : "#6b7280",
              borderBottom: tab === id ? "2px solid #6366f1" : "2px solid transparent",
              marginBottom: -2,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Upload tab ── */}
      {tab === "upload" && (
        <>
          <div
            ref={dropRef}
            style={{
              border: "2px dashed #e5e7eb", borderRadius: 12, padding: "48px 24px",
              textAlign: "center", cursor: "pointer", position: "relative",
              background: "#fafafa", marginBottom: 20, transition: "border-color .2s",
            }}
          >
            <input
              type="file"
              accept=".docx"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
            />
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <p style={{ fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>Drag &amp; drop <code>.docx</code> resume files here</p>
            <p style={{ fontSize: 13, color: "#9ca3af" }}>or click to browse — multiple files supported</p>
          </div>

          {queue.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Upload Queue</span>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setQueue([])}>Clear</button>
              </div>
              {queue.map((item) => <QueueItem key={item.id} item={item} />)}
            </div>
          )}
        </>
      )}

      {/* ── Candidates tab ── */}
      {tab === "candidates" && (
        <>
          <div className="section-header">
            <span className="section-title">{total > 0 ? `${total} candidates` : "Candidates"}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <form className="search-bar" onSubmit={handleSearch}>
                <input
                  className="search-input"
                  placeholder="Search name, skill, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn btn-primary" type="submit">Search</button>
                {query && <button className="btn btn-ghost" type="button" onClick={() => { setSearch(""); setQuery(""); }}>Clear</button>}
              </form>
              <select
                className="search-input"
                style={{ width: "auto", fontSize: 13 }}
                value={visaFilter}
                onChange={(e) => { setVisaFilter(e.target.value); setPage(1); }}
              >
                <option value="">All Visas</option>
                {["USC","GC","H1B","OPT","CPT","TN","EAD","Unknown"].map((v) => <option key={v}>{v}</option>)}
              </select>
              <select
                className="search-input"
                style={{ width: "auto", fontSize: 13 }}
                value={availFilter}
                onChange={(e) => { setAvailFilter(e.target.value); setPage(1); }}
              >
                <option value="">All Availability</option>
                {["Immediate","2 weeks","1 month","Unknown"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {loadingList ? (
            <div className="state-box"><div className="spinner" /><p>Loading candidates…</p></div>
          ) : candidates.length === 0 ? (
            <div className="state-box">
              <div className="icon">👥</div>
              <p>No candidates found. Upload some resumes first.</p>
            </div>
          ) : (
            <>
              <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Name","Title","Skills","Visa","Rate","Availability",""].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".7px", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.id} style={{ borderTop: "1px solid #f3f4f6", transition: "background .1s" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#fafafa"}
                        onMouseLeave={(e) => e.currentTarget.style.background = ""}
                      >
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1a1a2e" }}>{c.name || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "#6b7280", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.current_title || "—"}</td>
                        <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                          {(c.skills || []).slice(0, 4).map((s) => <SkillTag key={s} label={s} />)}
                          {(c.skills || []).length > 4 && <span style={{ fontSize: 11, color: "#9ca3af" }}> +{c.skills.length - 4}</span>}
                        </td>
                        <td style={{ padding: "10px 14px" }}><Badge text={c.visa_status || "Unknown"} color={visaColor(c.visa_status)} /></td>
                        <td style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>{c.expected_rate || "—"}</td>
                        <td style={{ padding: "10px 14px" }}><Badge text={c.availability || "Unknown"} color={availColor(c.availability)} /></td>
                        <td style={{ padding: "10px 14px" }}>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setSelected(c)}>View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button className="page-btn" disabled={page <= 1} onClick={() => loadCandidates(page - 1)}>← Prev</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = page <= 4 ? i + 1 : page - 3 + i;
                    if (p < 1 || p > totalPages) return null;
                    return <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => loadCandidates(p)}>{p}</button>;
                  })}
                  <button className="page-btn" disabled={page >= totalPages} onClick={() => loadCandidates(page + 1)}>Next →</button>
                  <span className="page-info">Page {page} of {totalPages}</span>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Detail / edit modal */}
      {selected && (
        <CandidateModal
          candidate={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => { setSelected(null); loadCandidates(page); loadStats(); }}
          onUpdated={() => { setSelected(null); loadCandidates(page); }}
        />
      )}
    </>
  );
}
