import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "/api";

function fmt(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const PROVIDER_LABEL = { claude: "Claude AI", groq: "Groq (Llama 3)" };

export default function MailDetail({ id, onClose }) {
  const [doc,      setDoc]      = useState(null);
  const [loading,  setLoading]  = useState(true);

  // draft reply state
  const [draft,       setDraft]       = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError,   setDraftError]   = useState("");
  const [provider,     setProvider]     = useState("");
  const [copied,       setCopied]       = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/mail-events/${id}`)
      .then((r) => r.json())
      .then(setDoc)
      .finally(() => setLoading(false));
  }, [id]);

  async function generateDraft() {
    setDraftLoading(true);
    setDraftError("");
    setDraft("");
    setProvider("");
    try {
      const r = await fetch(`${API}/mail-events/${id}/draft-reply`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Generation failed");
      setDraft(data.reply);
      setProvider(data.provider || "");
    } catch (e) {
      setDraftError(e.message || "Failed to generate reply.");
    } finally {
      setDraftLoading(false);
    }
  }

  function copyDraft() {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            {loading ? "Loading…" : doc?.subject || "(no subject)"}
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="state-box"><div className="spinner" /></div>
          ) : doc ? (
            <>
              <div className="detail-grid">
                <div className="detail-field">
                  <span className="detail-label">From Email</span>
                  <span className="detail-value">{doc.from_email || <span className="empty">—</span>}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Point of Contact</span>
                  <span className="detail-value">{doc.point_of_contact || <span className="empty">—</span>}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Client Name</span>
                  <span className="detail-value">{doc.client_name || <span className="empty">—</span>}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Job Contact Mail</span>
                  <span className="detail-value">{doc.job_contact_mail || <span className="empty">—</span>}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Fetched For Account</span>
                  <span className="detail-value">{doc.fetched_for || <span className="empty">—</span>}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Received At</span>
                  <span className="detail-value">{fmt(doc.received_at)}</span>
                </div>
                <div className="detail-field detail-full">
                  <span className="detail-label">Contact Vendor</span>
                  <span className="detail-value">
                    {doc.contact_vendor?.length > 0 ? (
                      <div className="tag-list" style={{ marginTop: 4 }}>
                        {doc.contact_vendor.map((v, i) => (
                          <span key={i} className="tag">{v}</span>
                        ))}
                      </div>
                    ) : <span className="empty">—</span>}
                  </span>
                </div>
                <div className="detail-field detail-full">
                  <span className="detail-label">Message ID</span>
                  <span className="detail-value" style={{ fontSize: 12, color: "#9ca3af" }}>
                    {doc.message_id || <span className="empty">—</span>}
                  </span>
                </div>
              </div>

              {/* ── mailclean enrichment block ── */}
              {doc.status === "processed" && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ background: "#f9fafb", padding: "8px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>mailclean Enrichment</span>
                    <span style={{ background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>✓ Processed</span>
                    {doc.confidence_score > 0 && (
                      <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
                        confidence: <strong>{(doc.confidence_score * 100).toFixed(0)}%</strong>
                      </span>
                    )}
                  </div>
                  <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Classification row */}
                    <div className="detail-grid">
                      {[
                        ["Job Title",    doc.job_title],
                        ["Seniority",    doc.seniority],
                        ["Work Type",    doc.work_type],
                        ["Job Type",     doc.job_type],
                      ].map(([label, value]) => value && value !== "unknown" ? (
                        <div key={label} className="detail-field">
                          <span className="detail-label">{label}</span>
                          <span className="detail-value">{value}</span>
                        </div>
                      ) : null)}
                    </div>

                    {/* Skills */}
                    {doc.skills?.length > 0 && (
                      <div>
                        <span className="detail-label" style={{ display: "block", marginBottom: 6 }}>
                          Skills ({doc.skill_count || doc.skills.length})
                        </span>
                        <div className="tag-list">
                          {(doc.primary_skills || []).map((s, i) => (
                            <span key={i} style={{ background: "#ede9fe", color: "#5b21b6", fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>{s}</span>
                          ))}
                          {(doc.secondary_skills || []).map((s, i) => (
                            <span key={i} style={{ background: "#f3f4f6", color: "#374151", fontSize: 11, padding: "2px 7px", borderRadius: 4 }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Details row */}
                    <div className="detail-grid">
                      {doc.salary?.raw && (
                        <div className="detail-field">
                          <span className="detail-label">Salary</span>
                          <span className="detail-value">{doc.salary.raw}</span>
                        </div>
                      )}
                      {doc.experience?.raw && (
                        <div className="detail-field">
                          <span className="detail-label">Experience</span>
                          <span className="detail-value">{doc.experience.raw}</span>
                        </div>
                      )}
                      {doc.visa_info?.types?.length > 0 && (
                        <div className="detail-field">
                          <span className="detail-label">Visa</span>
                          <span className="detail-value">{doc.visa_info.types.join(", ")}</span>
                        </div>
                      )}
                      {doc.locations?.length > 0 && (
                        <div className="detail-field">
                          <span className="detail-label">Locations</span>
                          <span className="detail-value">{doc.locations.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {doc.status === "error" && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b" }}>
                  <strong>mailclean error:</strong> {doc.error || "Unknown processing error"}
                </div>
              )}

              {/* Full description */}
              <div className="detail-field">
                <span className="detail-label" style={{ marginBottom: 8, display: "block" }}>Description (Full Body)</span>
                <div className="desc-box">
                  {doc.description || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No body content</span>}
                </div>
              </div>

              {/* ── Draft Reply ── */}
              <div style={{
                border: "1px solid #e5e7eb", borderRadius: 10,
                overflow: "hidden", marginTop: 4,
              }}>
                {/* header row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>✍️</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>AI Draft Reply</span>
                    {provider && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: provider === "claude" ? "#ede9fe" : "#dcfce7",
                        color:      provider === "claude" ? "#5b21b6" : "#166534",
                      }}>
                        {PROVIDER_LABEL[provider] || provider}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: "5px 14px" }}
                    onClick={generateDraft}
                    disabled={draftLoading}
                  >
                    {draftLoading ? "Generating…" : draft ? "Regenerate" : "Generate Reply"}
                  </button>
                </div>

                {/* body */}
                <div style={{ padding: 14 }}>
                  {draftLoading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#6b7280", fontSize: 13, padding: "8px 0" }}>
                      <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                      Generating humanised reply…
                    </div>
                  )}

                  {draftError && !draftLoading && (
                    <div style={{
                      background: "#fef2f2", border: "1px solid #fecaca",
                      borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b",
                    }}>
                      {draftError}
                    </div>
                  )}

                  {draft && !draftLoading && (
                    <>
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={10}
                        style={{
                          width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                          padding: "12px 14px", fontSize: 13, color: "#374151",
                          lineHeight: 1.7, resize: "vertical", outline: "none",
                          fontFamily: "inherit", background: "#fff",
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                        onBlur={(e)  => e.target.style.borderColor = "#e5e7eb"}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: "5px 14px" }}
                          onClick={copyDraft}
                        >
                          {copied ? "✓ Copied!" : "Copy to Clipboard"}
                        </button>
                      </div>
                    </>
                  )}

                  {!draft && !draftLoading && !draftError && (
                    <p style={{ fontSize: 13, color: "#9ca3af", padding: "6px 0" }}>
                      Click <strong>Generate Reply</strong> to draft a humanised response using AI.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="state-box"><p>Document not found.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
