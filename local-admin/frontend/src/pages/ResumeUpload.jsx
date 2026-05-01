import { useEffect, useRef, useState } from "react";
import { authFetch, getToken } from "../api.js";

// ── Rerun Scores button + status ─────────────────────────────────────────────
function RerunScores() {
  const [status, setStatus] = useState(null); // null | {running, mails, scored, done, error}
  const pollRef = useRef(null);

  async function fetchStatus() {
    try {
      const r = await authFetch(`${(import.meta.env.VITE_API_URL || "/api")}/resume/rerun-scores/status`);
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
  }

  async function handleRerun() {
    try {
      const r = await authFetch(
        `${(import.meta.env.VITE_API_URL || "/api")}/resume/rerun-scores`,
        { method: "POST" }
      );
      const data = await r.json();
      setStatus(data);
      // poll every 2s until done
      pollRef.current = setInterval(async () => {
        const r2 = await authFetch(`${(import.meta.env.VITE_API_URL || "/api")}/resume/rerun-scores/status`);
        if (r2.ok) {
          const s = await r2.json();
          setStatus(s);
          if (!s.running) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      }, 2000);
    } catch (e) {
      alert("Failed to start rerun: " + e.message);
    }
  }

  useEffect(() => { fetchStatus(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const running = status?.running;
  const done    = status?.done && !running;
  const btnText = running ? `⏳ Running… (${status.mails} mails)` : "🔄 Rerun Scores (Last 7 Days)";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "10px 16px",
      background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, marginBottom: 20,
    }}>
      <button
        onClick={handleRerun}
        disabled={running}
        style={{
          padding: "8px 20px", background: running ? "#94a3b8" : "#0ea5e9",
          color: "#fff", border: "none", borderRadius: 7, fontSize: 13,
          fontWeight: 700, cursor: running ? "not-allowed" : "pointer", whiteSpace: "nowrap",
        }}
      >
        {btnText}
      </button>
      {done && !status?.error && (
        <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
          ✓ Done — {status.scored} matches written across {status.mails} mails
        </span>
      )}
      {done && status?.error && (
        <span style={{ fontSize: 13, color: "#dc2626" }}>✗ Error: {status.error}</span>
      )}
      {!status && (
        <span style={{ fontSize: 12, color: "#64748b" }}>
          Scores all candidates against mails from the last 7 days and saves to job_matches.
        </span>
      )}
    </div>
  );
}

const API = (import.meta.env.VITE_API_URL || "/api") + "/resume";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SkillTag({ label, percent }) {
  return (
    <span style={{
      background: "#ede9fe", color: "#5b21b6",
      fontSize: 11, padding: "2px 7px", borderRadius: 4, display: "inline-block", margin: "1px 2px",
    }}>
      {label}{typeof percent === "number" ? ` ${percent}%` : ""}
    </span>
  );
}

// Normalize legacy string-skills to {name, percent} so the UI can rely on the new shape.
function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((s) => typeof s === "string" ? { name: s, percent: 100 } : s)
    .filter((s) => s && s.name);
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

const VISA_OPTS  = ["H1B","GC","USC","OPT","CPT","TN","EAD","Unknown"];
const AVAIL_OPTS = ["Immediate","2 weeks","1 month","Unknown"];

const TEXT_FIELDS = [
  ["Name",             "name",             "text",     "Full name"],
  ["Email",            "email",            "email",    "name@example.com"],
  ["Phone",            "phone",            "tel",      "+1 555-555-5555"],
  ["Location",         "location",         "text",     "City, State"],
  ["Current Title",    "current_title",    "text",     "Senior Java Developer"],
  ["Current Employer", "current_employer", "text",     "Company name"],
  ["Experience (yrs)", "total_experience_years", "number", "e.g. 8"],
  ["Expected Rate",    "expected_rate",    "text",     "$75/hr"],
  ["LinkedIn",         "linkedin",         "url",      "https://linkedin.com/in/…"],
  ["Work Auth",        "work_authorization","text",    "Authorization details"],
];

function CandidateModal({ candidate, onClose, onDeleted, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    name:                   candidate.name                   || "",
    email:                  candidate.email                  || "",
    phone:                  candidate.phone                  || "",
    location:               candidate.location               || "",
    current_title:          candidate.current_title          || "",
    current_employer:       candidate.current_employer       || "",
    total_experience_years: candidate.total_experience_years ?? "",
    expected_rate:          candidate.expected_rate          || "",
    linkedin:               candidate.linkedin               || "",
    work_authorization:     candidate.work_authorization     || "",
    visa_status:            candidate.visa_status            || "Unknown",
    availability:           candidate.availability           || "Unknown",
    summary:                candidate.summary                || "",
    skills:                 normalizeSkills(candidate.skills),
  }));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const skills = normalizeSkills(candidate.skills);
  const overallMatch =
    typeof candidate.overall_match === "number"
      ? candidate.overall_match
      : skills.length
        ? Math.round(skills.reduce((s, x) => s + x.percent, 0) / skills.length)
        : 0;

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function setSkillField(idx, key, value) {
    setForm((f) => {
      const next = [...f.skills];
      next[idx] = { ...next[idx], [key]: value };
      return { ...f, skills: next };
    });
  }
  function addSkill()      { setForm((f) => ({ ...f, skills: [...f.skills, { name: "", percent: 80 }] })); }
  function removeSkill(i)  { setForm((f) => ({ ...f, skills: f.skills.filter((_, idx) => idx !== i) })); }

  async function handleSave() {
    setSaving(true);
    try {
      // Send everything that's been filled (incl. empty string → cleared).
      // Backend strips None; frontend sends "" through as cleared.
      const updates = { ...form };
      // Coerce experience to int or null
      if (updates.total_experience_years === "" || updates.total_experience_years === null) {
        delete updates.total_experience_years;
      } else {
        const n = parseInt(updates.total_experience_years, 10);
        updates.total_experience_years = isNaN(n) ? undefined : n;
        if (updates.total_experience_years === undefined) delete updates.total_experience_years;
      }
      // Clean skills: drop empties; clamp percent
      updates.skills = updates.skills
        .filter((s) => s.name && s.name.trim())
        .map((s) => ({
          name:    s.name.trim(),
          percent: Math.max(0, Math.min(100, parseInt(s.percent, 10) || 0)),
        }));

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

  const inputStyle = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none" };
  const labelStyle = { fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">
            {candidate.name || "Candidate"}
            {skills.length > 0 && (
              <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: "#6366f1", background: "#eef2ff", padding: "2px 8px", borderRadius: 12 }}>
                Match {overallMatch}%
              </span>
            )}
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!editing ? (
            <>
              <div className="detail-grid">
                {[
                  ["Email",          candidate.email],
                  ["Phone",          candidate.phone],
                  ["Location",       candidate.location],
                  ["Title",          candidate.current_title],
                  ["Employer",       candidate.current_employer],
                  ["Experience",     candidate.total_experience_years != null ? `${candidate.total_experience_years} yrs` : null],
                  ["Visa",           candidate.visa_status],
                  ["Availability",   candidate.availability],
                  ["Rate",           candidate.expected_rate],
                  ["LinkedIn",       candidate.linkedin],
                  ["Work Auth",      candidate.work_authorization],
                  ["Uploaded",       fmt(candidate.uploaded_at)],
                ].map(([label, value]) => (
                  <div key={label} className="detail-field">
                    <span className="detail-label">{label}</span>
                    <span className={`detail-value ${!value ? "empty" : ""}`}>{value || "—"}</span>
                  </div>
                ))}
              </div>
              {skills.length > 0 && (
                <div>
                  <div className="detail-label" style={{ marginBottom: 6 }}>Skills</div>
                  <div>{skills.map((s) => <SkillTag key={s.name} label={s.name} percent={s.percent} />)}</div>
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
              {TEXT_FIELDS.map(([label, key, type, placeholder]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={form[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)}
                    style={inputStyle}
                  />
                </div>
              ))}
              {[
                ["Visa Status",  "visa_status",  VISA_OPTS],
                ["Availability", "availability", AVAIL_OPTS],
              ].map(([label, key, opts]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <select
                    value={form[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    style={{ ...inputStyle, background: "#fff" }}
                  >
                    {opts.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label style={labelStyle}>Summary</label>
                <textarea
                  rows={3}
                  value={form.summary}
                  onChange={(e) => setField("summary", e.target.value)}
                  style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
              </div>
              {/* Skills editor */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={labelStyle}>
                    Skills
                    {form.skills.length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: "#6366f1" }}>
                        avg {Math.round(form.skills.reduce((s, x) => s + (parseInt(x.percent, 10) || 0), 0) / form.skills.length)}%
                      </span>
                    )}
                  </label>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={addSkill}>
                    + Add skill
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {form.skills.length === 0 && (
                    <div style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>No skills yet — click "+ Add skill"</div>
                  )}
                  {form.skills.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Skill name"
                        value={s.name}
                        onChange={(e) => setSkillField(i, "name", e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={s.percent}
                        onChange={(e) => setSkillField(i, "percent", parseInt(e.target.value, 10))}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={s.percent}
                        onChange={(e) => setSkillField(i, "percent", e.target.value)}
                        style={{ ...inputStyle, width: 64 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeSkill(i)}
                        style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 18, padding: 4 }}
                        title="Remove skill"
                      >✕</button>
                    </div>
                  ))}
                </div>
              </div>
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

      {/* Rerun Scores */}
      <RerunScores />

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
                          {normalizeSkills(c.skills).slice(0, 4).map((s) => (
                            <SkillTag key={s.name} label={s.name} percent={s.percent} />
                          ))}
                          {normalizeSkills(c.skills).length > 4 && (
                            <span style={{ fontSize: 11, color: "#9ca3af" }}> +{normalizeSkills(c.skills).length - 4}</span>
                          )}
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
