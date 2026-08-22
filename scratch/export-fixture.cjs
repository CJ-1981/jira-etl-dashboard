// Export MasterTicket.rawData to a compact JSON fixture (changelog dropped —
// the candidate formulas don't use transitions/timeInStatus).
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
      delete obj.changelog;
      raws.push(obj);
    }
  } catch { /* skip */ }
}
const out = 'C:/Users/Chimin.Jung/Downloads/jira-etl-dashboard/scratch/issues-fixture.json';
fs.writeFileSync(out, JSON.stringify(raws));
console.log(`Exported ${raws.length} raw issues, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
