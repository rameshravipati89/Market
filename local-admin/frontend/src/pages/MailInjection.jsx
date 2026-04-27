import { useEffect, useState } from "react";
import { authFetch } from "../api.js";

const API = import.meta.env.VITE_API_URL || "/api";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const EMPTY_FORM = {
  label: "", host: "", port: "993", ssl: true, user: "", password: "", active: true,
};

// ── AccountModal ──────────────────────────────────────────────────────────────

function AccountModal({ editing, onClose, onSaved }) {
  const isEdit = !!editing;
  const [form,       setForm]       = useState(isEdit ? { ...editing, password: "" } : { ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error,      setError]      = useState("");

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    setTestResult(null);
    setError("");
  }

  async function handleTest() {
    if (!form.host || !form.user || !form.password) {
      setError("Host, email, and password are required to test.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const r = await authFetch(`${API}/credentials/test`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          host: form.host, port: parseInt(form.port) || 993,
          ssl: form.ssl, user: form.user, password: form.password,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setTestResult({ ok: false, msg: d.detail }); return; }
      setTestResult({ ok: true, count: d.inbox_count });
    } catch { setTestResult({ ok: false, msg: "Network error" }); }
    finally   { setTesting(false); }
  }

  async function handleSave() {
    if (!form.label || !form.host || !form.user) {
      setError("Label, host, and email address are required.");
      return;
    }
    if (!isEdit && !form.password) {
      setError("Password is required when adding an account.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url    = isEdit ? `${API}/credentials/${editing.id}` : `${API}/credentials`;
      const method = isEdit ? "PUT" : "POST";
      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label, host: form.host,
          port: parseInt(form.port) || 993,
          ssl: form.ssl, user: form.user,
          password: form.password,
          active: form.active,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.detail || "Save failed"); return; }
      onSaved();
    } catch { setError("Network error"); }
    finally   { setSaving(false); }
  }

  const inputStyle = {
    width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box",
    background: "#fff",
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-title">{isEdit ? "Edit Mail Account" : "Add Mail Account"}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ gap: 14 }}>

          {/* Info banner */}
          <div style={{
            background: "#ede9fe", borderRadius: 8, padding: "10px 14px",
            fontSize: 12, color: "#5b21b6", lineHeight: 1.6,
          }}>
            All accounts are <strong>read-only</strong> — emails are fetched silently using
            IMAP PEEK (no &ldquo;Seen&rdquo; flags are set on your mail server).
            New accounts go live within 60 seconds of saving.
          </div>

          {/* Label */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
              Display Label *
            </label>
            <input
              style={inputStyle} placeholder="e.g. HR Inbox — Acme Corp"
              value={form.label} onChange={e => set("label", e.target.value)}
            />
          </div>

          {/* Host + Port + SSL */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
                IMAP Host *
              </label>
              <input
                style={inputStyle} placeholder="mail.example.com"
                value={form.host} onChange={e => set("host", e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
                Port
              </label>
              <input
                style={inputStyle} type="number" placeholder="993"
                value={form.port} onChange={e => set("port", e.target.value)}
              />
            </div>
          </div>

          {/* SSL toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
            <div
              onClick={() => set("ssl", !form.ssl)}
              style={{
                width: 40, height: 22, borderRadius: 11, transition: "background .2s",
                background: form.ssl ? "#6366f1" : "#d1d5db",
                position: "relative", flexShrink: 0, cursor: "pointer",
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: form.ssl ? 21 : 3, width: 16, height: 16,
                borderRadius: "50%", background: "#fff", transition: "left .2s",
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
              SSL / TLS (recommended — port 993)
            </span>
          </label>

          {/* Email + Password */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
              Email Address *
            </label>
            <input
              style={inputStyle} type="email" placeholder="user@example.com"
              value={form.user} onChange={e => set("user", e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 5 }}>
              Password {isEdit && <span style={{ fontWeight: 400, color: "#9ca3af" }}>(leave blank to keep existing)</span>}
            </label>
            <input
              style={inputStyle} type="password"
              placeholder={isEdit ? "••••••••  (unchanged)" : "IMAP password"}
              value={form.password} onChange={e => set("password", e.target.value)}
            />
          </div>

          {/* Active toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
            <div
              onClick={() => set("active", !form.active)}
              style={{
                width: 40, height: 22, borderRadius: 11, transition: "background .2s",
                background: form.active ? "#10b981" : "#d1d5db",
                position: "relative", flexShrink: 0, cursor: "pointer",
              }}
            >
              <div style={{
                position: "absolute", top: 3, left: form.active ? 21 : 3, width: 16, height: 16,
                borderRadius: "50%", background: "#fff", transition: "left .2s",
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
              Active (injector picks up this account)
            </span>
          </label>

          {/* Test result */}
          {testResult && (
            <div style={{
              background: testResult.ok ? "#dcfce7" : "#fef2f2",
              border: `1px solid ${testResult.ok ? "#86efac" : "#fecaca"}`,
              borderRadius: 8, padding: "10px 14px", fontSize: 13,
              color: testResult.ok ? "#166534" : "#991b1b",
            }}>
              {testResult.ok
                ? `✓ Connection successful — ${testResult.count.toLocaleString()} messages in INBOX`
                : `✗ ${testResult.msg}`}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca",
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b",
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: "14px 24px", borderTop: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <button
            className="btn btn-ghost"
            onClick={handleTest}
            disabled={testing}
            style={{ fontSize: 13 }}
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MailInjection() {
  const [creds,   setCreds]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);  // null | "add" | <cred>
  const [deleting, setDeleting] = useState(null);
  const [toggling, setToggling] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/credentials`);
      if (r.ok) setCreds(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(cred) {
    setToggling(cred.id);
    try {
      const r = await authFetch(`${API}/credentials/${cred.id}/toggle`, { method: "PATCH" });
      if (r.ok) {
        const { active } = await r.json();
        setCreds(cs => cs.map(c => c.id === cred.id ? { ...c, active } : c));
      }
    } catch { /* ignore */ }
    finally { setToggling(null); }
  }

  async function handleDelete(cred) {
    if (!confirm(`Delete "${cred.label || cred.user}"?\nThis cannot be undone.`)) return;
    setDeleting(cred.id);
    try {
      const r = await authFetch(`${API}/credentials/${cred.id}`, { method: "DELETE" });
      if (r.ok) setCreds(cs => cs.filter(c => c.id !== cred.id));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  }

  const active   = creds.filter(c => c.active).length;
  const inactive = creds.filter(c => !c.active).length;

  return (
    <>
      {/* Stats + header */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 24 }}>
        <div className="stat-card accent">
          <div className="label">Total Accounts</div>
          <div className="value">{creds.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active</div>
          <div className="value" style={{ color: "#10b981" }}>{active}</div>
          <div className="sub">injector watching</div>
        </div>
        <div className="stat-card">
          <div className="label">Inactive</div>
          <div className="value" style={{ color: "#9ca3af" }}>{inactive}</div>
          <div className="sub">paused</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="section-header" style={{ marginBottom: 16 }}>
        <span className="section-title">IMAP Mail Accounts</span>
        <button className="btn btn-primary" onClick={() => setModal("add")}>
          + Add Account
        </button>
      </div>

      {/* Account list */}
      {loading ? (
        <div className="state-box"><div className="spinner" /><p>Loading accounts…</p></div>
      ) : creds.length === 0 ? (
        <div className="state-box">
          <div className="icon" style={{ fontSize: 40, marginBottom: 12 }}>📮</div>
          <p style={{ fontSize: 14, marginBottom: 12 }}>No mail accounts configured yet.</p>
          <button className="btn btn-primary" onClick={() => setModal("add")}>
            Add Your First Account
          </button>
        </div>
      ) : (
        <div className="cred-list">
          {creds.map(cred => (
            <div
              key={cred.id}
              className="cred-card"
              style={{ borderLeftColor: cred.active ? "#10b981" : "#d1d5db" }}
            >
              <span className="cred-icon" style={{ fontSize: 26 }}>📮</span>

              <div className="cred-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="cred-label">{cred.label || cred.user}</div>
                <div className="cred-user">{cred.user}</div>
                <div className="cred-meta">
                  {cred.host}:{cred.port}
                  &nbsp;·&nbsp;SSL: {cred.ssl ? "Yes" : "No"}
                  &nbsp;·&nbsp;Added: {fmt(cred.created_at)}
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginRight: 8 }}>
                <div
                  onClick={() => !toggling && handleToggle(cred)}
                  style={{
                    width: 38, height: 21, borderRadius: 11,
                    background: cred.active ? "#10b981" : "#d1d5db",
                    position: "relative", cursor: toggling === cred.id ? "not-allowed" : "pointer",
                    transition: "background .2s", opacity: toggling === cred.id ? .6 : 1,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2.5, left: cred.active ? 19 : 2.5,
                    width: 16, height: 16, borderRadius: "50%",
                    background: "#fff", transition: "left .2s",
                  }} />
                </div>
                <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>
                  {cred.active ? "Active" : "Off"}
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: "5px 12px" }}
                  onClick={() => setModal(cred)}
                >
                  Edit
                </button>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: "5px 12px", background: "#fee2e2", color: "#991b1b" }}
                  onClick={() => handleDelete(cred)}
                  disabled={deleting === cred.id}
                >
                  {deleting === cred.id ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ marginTop: 32 }}>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">How It Works</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
          {[
            { icon: "🔒", title: "Silent Read-Only",         desc: "Uses IMAP PEEK — no \\Seen flags are set. Your mail client won't show any emails as read." },
            { icon: "⚡", title: "Real-Time IDLE Push",       desc: "Each account uses IMAP IDLE. New mail arrives in MongoDB within seconds." },
            { icon: "🔄", title: "Dynamic Account Reload",    desc: "The injector polls MongoDB every 60s. Add or remove accounts here — no restart needed." },
            { icon: "🔁", title: "Deduplication",             desc: "Every email is keyed by Message-ID. Re-connecting never creates duplicates." },
          ].map(s => (
            <div key={s.title} style={{
              background: "#fff", borderRadius: 10, padding: "14px 18px",
              boxShadow: "0 1px 4px rgba(0,0,0,.06)", display: "flex", gap: 12, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{s.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1a2e", marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <AccountModal
          editing={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </>
  );
}
