import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function MailInjection() {
  const [creds,   setCreds]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/credentials`)
      .then((r) => r.json())
      .then(setCreds)
      .catch(() => setCreds([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {/* Info banner */}
      <div style={{
        background: "#ede9fe", borderRadius: 10, padding: "14px 20px",
        marginBottom: 24, fontSize: 13, color: "#5b21b6", lineHeight: 1.6,
      }}>
        <strong>How it works:</strong> IMAP credentials are stored in MongoDB <code>credentials</code> collection.
        The mail_injector service loads them at startup, connects to each account,
        fetches <strong>UNSEEN</strong> emails in batches of 200, and inserts them into <code>mail_events</code>.
      </div>

      {/* Credentials list */}
      <div className="section-header">
        <span className="section-title">IMAP Accounts</span>
      </div>

      {loading ? (
        <div className="state-box"><div className="spinner" /><p>Loading accounts…</p></div>
      ) : creds.length === 0 ? (
        <div className="state-box">
          <div className="icon">🔒</div>
          <p>No IMAP accounts found in the credentials collection.</p>
        </div>
      ) : (
        <div className="cred-list">
          {creds.map((c) => (
            <div key={c._id} className="cred-card">
              <span className="cred-icon">📮</span>
              <div className="cred-info">
                <div className="cred-label">{c.label || c.user}</div>
                <div className="cred-user">{c.user}</div>
                <div className="cred-meta">
                  {c.host}:{c.port} &nbsp;·&nbsp; SSL: {c.ssl ? "Yes" : "No"}
                  &nbsp;·&nbsp; Added: {fmt(c.created_at)}
                </div>
              </div>
              <span className={`cred-badge ${c.active ? "active" : "inactive"}`}>
                {c.active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline steps */}
      <div className="section-header" style={{ marginTop: 32 }}>
        <span className="section-title">Injection Pipeline</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { step: "1", icon: "🔌", title: "IMAP Connect", desc: "Connects to mail server via SSL on port 993" },
          { step: "2", icon: "📥", title: "Fetch UNSEEN", desc: "Searches INBOX for UNSEEN messages, fetches in batches of 200" },
          { step: "3", icon: "📝", title: "Parse Email", desc: "Extracts subject, body, from_email, point_of_contact, client_name, contact_vendor, job_contact_mail" },
          { step: "4", icon: "💾", title: "Insert to MongoDB", desc: "Bulk insert_many(ordered=False) into mail_events collection. Duplicates skipped." },
          { step: "5", icon: "✅", title: "Mark as Seen", desc: "Flags fetched messages as \\Seen on IMAP server to avoid re-fetching" },
        ].map((s) => (
          <div key={s.step} style={{
            background: "#fff", borderRadius: 10, padding: "14px 18px",
            display: "flex", alignItems: "flex-start", gap: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,.06)",
          }}>
            <span style={{
              background: "#6366f1", color: "#fff", borderRadius: "50%",
              width: 28, height: 28, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>{s.step}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e", marginBottom: 2 }}>
                {s.icon} {s.title}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
