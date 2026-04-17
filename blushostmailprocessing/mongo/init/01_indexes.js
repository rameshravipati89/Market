// Auto-runs on first container start via docker-entrypoint-initdb.d
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "maildb");

// TTL — documents expire 30 days after ingestion
db.mail_events.createIndex(
  { received_at: 1 },
  { expireAfterSeconds: 2592000, name: "ttl_30d" }
);

// Dedup on Message-ID
db.mail_events.createIndex(
  { message_id: 1 },
  { unique: true, sparse: true, name: "idx_message_id" }
);

// Common query patterns
db.mail_events.createIndex({ from_email: 1 },       { name: "idx_from_email" });
db.mail_events.createIndex({ job_contact_mail: 1 },  { name: "idx_job_contact" });
db.mail_events.createIndex({ received_at: -1 },      { name: "idx_received_desc" });

print("mail_events indexes created.");

// ── credentials collection indexes are in 02_seed_credentials.js ─────────────
