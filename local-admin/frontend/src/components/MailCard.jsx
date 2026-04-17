import { useState } from "react";
import MailDetail from "./MailDetail.jsx";

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function val(v) {
  return v || <span className="empty">—</span>;
}

const STATUS_STYLE = {
  processed: { background: "#dcfce7", color: "#166534" },
  error:     { background: "#fee2e2", color: "#991b1b" },
  pending:   { background: "#f3f4f6", color: "#6b7280" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  const label = status === "processed" ? "✓ Enriched" : status === "error" ? "⚠ Error" : "⏳ Pending";
  return (
    <span style={{ ...s, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

export default function MailCard({ mail }) {
  const [open, setOpen] = useState(false);
  const isEnriched = mail.status === "processed";

  return (
    <>
      <div className="mail-card" onClick={() => setOpen(true)}>
        {/* Document header */}
        <div className="mail-card-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className={`mail-subject ${!mail.subject ? "empty" : ""}`}>
              {mail.subject || "(no subject)"}
            </span>
            {/* mailclean job title */}
            {mail.job_title && (
              <div style={{ fontSize: 12, color: "#6366f1", fontWeight: 600, marginTop: 2 }}>
                {mail.job_title}
                {mail.seniority && mail.seniority !== "unknown" && (
                  <span style={{ color: "#9ca3af", fontWeight: 400 }}> · {mail.seniority}</span>
                )}
                {mail.work_type && mail.work_type !== "unknown" && (
                  <span style={{ color: "#9ca3af", fontWeight: 400 }}> · {mail.work_type}</span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <span className="mail-date">{fmt(mail.received_at)}</span>
            <StatusBadge status={mail.status || "pending"} />
          </div>
        </div>

        {/* Structured fields */}
        <div className="mail-card-fields">
          <div className="mail-field">
            <span className="mail-field-label">From Email</span>
            <span className="mail-field-value">{val(mail.from_email)}</span>
          </div>
          <div className="mail-field">
            <span className="mail-field-label">Point of Contact</span>
            <span className="mail-field-value">{val(mail.point_of_contact)}</span>
          </div>
          <div className="mail-field">
            <span className="mail-field-label">Client Name</span>
            <span className="mail-field-value">{val(mail.client_name)}</span>
          </div>
          <div className="mail-field">
            <span className="mail-field-label">Job Contact Mail</span>
            <span className="mail-field-value">{val(mail.job_contact_mail)}</span>
          </div>
          <div className="mail-field" style={{ gridColumn: "1 / -1" }}>
            <span className="mail-field-label">Contact Vendor</span>
            <span className="mail-field-value">
              {mail.contact_vendor?.length > 0 ? (
                <div className="tag-list">
                  {mail.contact_vendor.map((v, i) => <span key={i} className="tag">{v}</span>)}
                </div>
              ) : (
                <span className="empty">—</span>
              )}
            </span>
          </div>
        </div>

        {/* mailclean skills row — only when enriched */}
        {isEnriched && mail.skills?.length > 0 && (
          <div style={{ padding: "8px 18px", borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
            <div className="mail-desc-label" style={{ marginBottom: 5 }}>Skills extracted by mailclean</div>
            <div className="tag-list">
              {mail.skills.slice(0, 10).map((s, i) => (
                <span key={i} style={{ background: "#ede9fe", color: "#5b21b6", fontSize: 11, padding: "2px 7px", borderRadius: 4 }}>{s}</span>
              ))}
              {mail.skills.length > 10 && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>+{mail.skills.length - 10} more</span>
              )}
            </div>
          </div>
        )}

        {/* Description preview */}
        <div className="mail-card-body">
          <div className="mail-desc-label">Body</div>
          <div className="mail-desc-text">
            {mail.description
              ? mail.description.slice(0, 200) + (mail.description.length > 200 ? "…" : "")
              : <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Click to view full body →</span>}
          </div>
        </div>
      </div>

      {open && <MailDetail id={mail.id} onClose={() => setOpen(false)} />}
    </>
  );
}
