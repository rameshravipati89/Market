const titles = {
  "mail-events":   "Mail Events",
  "mail-inject":   "Mail Injection",
  "resume-upload": "Resume Upload",
};

export default function Header({ page, onLogout }) {
  return (
    <div className="topbar">
      <span className="topbar-title">{titles[page] || "Local Admin"}</span>
      <div className="topbar-right">
        <span className="badge-live">● Live</span>
        <button
          onClick={onLogout}
          style={{
            background: "none", border: "1px solid #e5e7eb", borderRadius: 7,
            padding: "5px 12px", fontSize: 12, color: "#6b7280",
            cursor: "pointer", fontWeight: 500,
          }}
          onMouseEnter={(e) => e.target.style.borderColor = "#6366f1"}
          onMouseLeave={(e) => e.target.style.borderColor = "#e5e7eb"}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
