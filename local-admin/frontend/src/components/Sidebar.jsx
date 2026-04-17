export default function Sidebar({ activePage, onNavigate }) {
  const mailItems = [
    { id: "mail-events", icon: "📬", label: "Mail Events" },
    { id: "mail-inject", icon: "⚙️", label: "Mail Injection" },
  ];

  const resumeItems = [
    { id: "resume-upload", icon: "📄", label: "Upload Resumes" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>📋 Local Admin</h1>
        <p>Bluehost Mail Processing</p>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section">Mail</div>
        {mailItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activePage === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
        <div className="nav-section">Candidates</div>
        {resumeItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activePage === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </nav>
    </aside>
  );
}
