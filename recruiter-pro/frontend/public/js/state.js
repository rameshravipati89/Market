// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE
// Single object shared across all modules via window.state
// ─────────────────────────────────────────────────────────────────────────────
window.state = {
  profiles:        [],      // [{name, color, keywords}]
  activeProfile:   null,
  mails:           [],      // all mails loaded so far
  filteredMails:   [],      // mails after search/filter
  selectedMailId:  null,
  selectedMailData:null,
  filter:          'all',
  chartInstances:  {},
  // infinite scroll tracking
  mailSkip:        0,
  mailTotal:       0,
  mailLoadingMore: false,
};
