const titles = {
  "mail-events":   "Mail Events",
  "mail-inject":   "Mail Injection",
  "resume-upload": "Resume Upload",
};

export default function Header({ page }) {
  return (
    <div className="topbar">
      <span className="topbar-title">{titles[page] || "Local Admin"}</span>
      <div className="topbar-right">
        <span className="badge-live">● Live</span>
      </div>
    </div>
  );
}
