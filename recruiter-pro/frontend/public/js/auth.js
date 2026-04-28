// ─────────────────────────────────────────────────────────────────────────────
// AUTH — token storage + login gate. Loaded FIRST (before all other scripts).
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = "riq_token";
const ROLE_KEY  = "riq_role";
const EMAIL_KEY = "riq_email";

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getRole()  { return localStorage.getItem(ROLE_KEY)  || ""; }
function getEmail() { return localStorage.getItem(EMAIL_KEY) || ""; }

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(EMAIL_KEY);
  location.replace("/login.html");
}

// Gate the page — redirect to login if no token.
(function gate() {
  if (!getToken()) location.replace("/login.html");
})();

// Render the user badge in the topbar after DOM loads
document.addEventListener("DOMContentLoaded", () => {
  const slot = document.getElementById("userBadge");
  if (!slot) return;
  const role  = getRole();
  const email = getEmail();
  const label = role === "admin" ? "Admin" : (email || "Recruiter");
  slot.innerHTML =
    `<span style="color:rgba(255,255,255,.85);font-size:.78rem;margin-right:8px">${label}</span>` +
    `<button onclick="logout()" style="padding:4px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.25);` +
    `background:rgba(255,255,255,.12);color:#fff;font-size:.75rem;cursor:pointer">Logout</button>`;
});
