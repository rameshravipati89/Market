import { useEffect, useState, useCallback } from "react";
import MailCard from "../components/MailCard.jsx";

const API = import.meta.env.VITE_API_URL || "/api";

export default function MailEvents() {
  const [stats,      setStats]      = useState(null);
  const [mails,      setMails]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [pages,      setPages]      = useState(1);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState("");
  const [query,      setQuery]      = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading,    setLoading]    = useState(true);

  // Load stats
  function loadStats() {
    fetch(`${API}/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }
  useEffect(() => { loadStats(); }, []);

  // Load mail events
  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (query)        params.set("search", query);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`${API}/mail-events?${params}`)
      .then((r) => r.json())
      .then((res) => {
        setMails(res.data || []);
        setTotal(res.total || 0);
        setPages(res.pages || 1);
      })
      .catch(() => setMails([]))
      .finally(() => setLoading(false));
  }, [page, query, statusFilter]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setQuery(search);
  }

  function handleClear() {
    setSearch("");
    setQuery("");
    setStatusFilter("");
    setPage(1);
  }

  return (
    <>
      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card accent">
            <div className="label">Total Emails</div>
            <div className="value">{stats.total_emails.toLocaleString()}</div>
            <div className="sub">in mail_events collection</div>
          </div>
          <div className="stat-card">
            <div className="label">Received Today</div>
            <div className="value">{stats.today_emails.toLocaleString()}</div>
            <div className="sub">since midnight</div>
          </div>
          <div className="stat-card">
            <div className="label">Enriched by mailclean</div>
            <div className="value" style={{ color: "#10b981" }}>{stats.processed_emails?.toLocaleString() ?? "—"}</div>
            <div className="sub">status = processed</div>
          </div>
          <div className="stat-card">
            <div className="label">Pending mailclean</div>
            <div className="value" style={{ color: "#f59e0b" }}>{stats.pending_emails?.toLocaleString() ?? "—"}</div>
            <div className="sub">no status yet</div>
          </div>
          <div className="stat-card">
            <div className="label">Active IMAP Accounts</div>
            <div className="value">{stats.active_accounts}</div>
            <div className="sub">in credentials collection</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="section-header" style={{ flexWrap: "wrap", gap: 10 }}>
        <span className="section-title">
          {total > 0 ? `${total.toLocaleString()} documents` : "Mail Documents"}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <form className="search-bar" onSubmit={handleSearch}>
            <input
              className="search-input"
              placeholder="Search subject, from, skill…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">Search</button>
            {(query || statusFilter) && (
              <button className="btn btn-ghost" type="button" onClick={handleClear}>Clear</button>
            )}
          </form>
          <select
            className="search-input"
            style={{ width: "auto", fontSize: 13, cursor: "pointer" }}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            <option value="processed">✓ Enriched</option>
            <option value="pending">⏳ Pending</option>
            <option value="error">⚠ Error</option>
          </select>
        </div>
      </div>

      {/* Mail list */}
      {loading ? (
        <div className="state-box"><div className="spinner" /><p>Loading emails…</p></div>
      ) : mails.length === 0 ? (
        <div className="state-box">
          <div className="icon">📭</div>
          <p>{query || statusFilter ? "No emails match your filters." : "No emails in the database yet."}</p>
        </div>
      ) : (
        <>
          <div className="mail-list">
            {mails.map((mail) => (
              <MailCard key={mail.id || mail._id} mail={mail} />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="pagination">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>← Prev</button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                const p = page <= 4 ? i + 1 : page - 3 + i;
                if (p < 1 || p > pages) return null;
                return (
                  <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>
                    {p}
                  </button>
                );
              })}
              <button className="page-btn" disabled={page === pages} onClick={() => setPage(page + 1)}>Next →</button>
              <span className="page-info">Page {page} of {pages}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
