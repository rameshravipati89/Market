import { useEffect, useState } from "react";
import { clearToken, getToken, setToken } from "./api.js";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MailEvents from "./pages/MailEvents.jsx";
import MailInjection from "./pages/MailInjection.jsx";
import ResumeUpload from "./pages/ResumeUpload.jsx";

export default function App() {
  const [token, setTokenState] = useState(getToken);
  const [page,  setPage]       = useState("mail-events");

  useEffect(() => {
    const handler = () => { clearToken(); setTokenState(null); };
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, []);

  function handleLogin(t) {
    setToken(t);
    setTokenState(t);
  }

  function handleLogout() {
    clearToken();
    setTokenState(null);
  }

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className="main">
        <Header page={page} onLogout={handleLogout} />
        <div className="content">
          {page === "mail-events"    && <MailEvents />}
          {page === "mail-inject"    && <MailInjection />}
          {page === "resume-upload"  && <ResumeUpload />}
        </div>
      </div>
    </div>
  );
}
