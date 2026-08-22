// Export MasterTicket.rawData to a compact JSON fixture. The changelog is
// trimmed to status-transition items only (needed for transitions/timeInStatus
// and rework detection) to keep the file small.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const db = new DatabaseSync('C:/Users/Chimin.Jung/Downloads/jira-etl-dashboard/prisma/db/custom.db', { readOnly: true });
const rows = db.prepare('SELECT rawData FROM MasterTicket').all();
db.close();
const raws = [];
for (const r of rows) {
  try {
    const obj = JSON.parse(r.rawData);
    if (obj && typeof obj === 'object') {
      if (obj.changelog && Array.isArray(obj.changelog.histories)) {
        const histories = [];
        for (const h of obj.changelog.histories) {
          const items = (h.items || []).filter((it) => it.field === 'status');
          if (items.length > 0) {
            histories.push({
              author: h.author ? { displayName: h.author.displayName } : undefined,
              created: h.created,
              items: items.map((it) => ({ field: it.field, fromString: it.fromString, toString: it.toString })),
            });
          }
        }
        obj.changelog = histories.length > 0 ? { histories } : undefined;
      }
      raws.push(obj);
    }
  } catch { /* skip */ }
}
const out = 'C:/Users/Chimin.Jung/Downloads/jira-etl-dashboard/scratch/issues-fixture.json';
fs.writeFileSync(out, JSON.stringify(raws));
console.log(`Exported ${raws.length} raw issues, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
