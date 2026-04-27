import { useState } from "react";
import { setToken } from "../api.js";

const API = import.meta.env.VITE_API_URL || "/api";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Login failed");
        return;
      }
      setToken(data.token);
      onLogin(data.token);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#f0f2f5",
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, boxShadow: "0 4px 24px rgba(0,0,0,.10)",
        width: "100%", maxWidth: 380, overflow: "hidden",
      }}>
        {/* Brand bar */}
        <div style={{ background: "#1a1a2e", padding: "28px 32px 24px" }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", letterSpacing: .4 }}>
            Local Admin
          </div>
          <div style={{ fontSize: 12, color: "#8b8bab", marginTop: 3 }}>
            Multilevel Marketing Dashboard
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "28px 32px 32px" }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".7px" }}>
              Username
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                padding: "10px 14px", fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
              onFocus={(e) => e.target.style.borderColor = "#6366f1"}
              onBlur={(e)  => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".7px" }}>
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
                padding: "10px 14px", fontSize: 14, outline: "none", boxSizing: "border-box",
              }}
              onFocus={(e) => e.target.style.borderColor = "#6366f1"}
              onBlur={(e)  => e.target.style.borderColor = "#e5e7eb"}
            />
          </div>

          {error && (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
              padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", background: "#6366f1", color: "#fff", border: "none",
              borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1,
              transition: "opacity .15s",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
