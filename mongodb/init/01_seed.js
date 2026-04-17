// MongoDB init script — runs once on first container start
// Seeds IMAP credentials if the collection is empty

db = db.getSiblingDB('maildb');

if (db.credentials.countDocuments({}) === 0) {
  db.credentials.insertOne({
    type:       "imap",
    label:      "VirtuousTech Bluehost",
    user:       "Sanathm@virtuoustech.com",
    password:   "24R21E0082",
    host:       "mail.virtuoustech.com",
    port:       993,
    ssl:        true,
    active:     true,
    created_at: new Date()
  });
  print("Seeded IMAP credentials.");
} else {
  print("IMAP credentials already present — skipping seed.");
}
