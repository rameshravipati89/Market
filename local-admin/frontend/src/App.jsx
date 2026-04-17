import { useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import MailEvents from "./pages/MailEvents.jsx";
import MailInjection from "./pages/MailInjection.jsx";
import ResumeUpload from "./pages/ResumeUpload.jsx";

export default function App() {
  const [page, setPage] = useState("mail-events");

  return (
    <div className="layout">
      <Sidebar activePage={page} onNavigate={setPage} />
      <div className="main">
        <Header page={page} />
        <div className="content">
          {page === "mail-events"    && <MailEvents />}
          {page === "mail-inject"    && <MailInjection />}
          {page === "resume-upload"  && <ResumeUpload />}
        </div>
      </div>
    </div>
  );
}
