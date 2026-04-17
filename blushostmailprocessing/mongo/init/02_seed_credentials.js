// Seed the credentials collection with IMAP mail accounts.
// Uses upsert on `user` so re-running never creates duplicates.
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "maildb");

// ── Index on credentials ──────────────────────────────────────────────────────
db.credentials.createIndex(
  { type: 1, user: 1 },
  { unique: true, name: "idx_type_user" }
);

db.credentials.createIndex(
  { type: 1, active: 1 },
  { name: "idx_type_active" }
);

// ── Seed IMAP accounts ────────────────────────────────────────────────────────
var accounts = [
  {
    type:       "imap",
    label:      "Sanath M — VirtuousTech",
    host:       "mail.virtuoustech.com",
    port:       993,
    ssl:        true,
    user:       "Sanathm@virtuoustech.com",
    password:   "24R21E0082",
    active:     true,
    created_at: new Date(),
    updated_at: new Date()
  }
];

accounts.forEach(function(acct) {
  db.credentials.updateOne(
    { type: acct.type, user: acct.user },
    { $set: acct },
    { upsert: true }
  );
  print("Upserted credential: " + acct.user);
});

print("credentials collection seeded.");
