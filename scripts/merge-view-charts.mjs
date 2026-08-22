/**
 * Merge the recommended chart layout into the existing "AMQ/GTS - ALL"
 * dashboard view and write the result into kpi-plugin-config.json
 * (databaseViews section). The view keeps its real id, so the config import
 * upserts the existing view instead of creating a duplicate.
 *
 * Usage: node scripts/merge-view-charts.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'prisma', 'db', 'custom.db');
const CONFIG_PATH = path.join(ROOT, 'kpi-plugin-config.json');
const VIEW_NAME = 'AMQ/GTS - ALL';

// Recommended charts (order = dashboard layout order). Charts already present
// in the view are kept as-is; the rest are appended.
const RECOMMENDED_CHARTS = [
  { id: 'chart-cfd', kpiId: 'cumulative_flow_trend', type: 'area', width: 'full', height: 'tall', customTitle: 'Cumulative Flow (by Status)', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-throughput-trend', kpiId: 'throughput_trend', type: 'line', width: 'md', height: 'md', customTitle: 'Weekly Throughput', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-processing-trend', kpiId: 'processing_time_trend', type: 'line', width: 'md', height: 'md', customTitle: 'Avg. Processing Time Trend', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-sla-trend', kpiId: 'sla_trend', type: 'line', width: 'md', height: 'md', customTitle: 'SLA Compliance Trend', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-sla-excl-clone-trend', kpiId: 'sla_by_status_excl_clone_trend', type: 'line', width: 'md', height: 'md', customTitle: 'SLA by Status (Excl. Clones)', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-assignee-trend', kpiId: 'open_tickets_by_assignee_trend', type: 'area', width: 'full', height: 'tall', customTitle: 'Open Tickets by Assignee', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-tis-daily', kpiId: 'time_in_status_trend_daily', type: 'line', width: 'full', height: 'md', customTitle: 'Turnaround Time by Status (Daily)', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-open-priority', kpiId: 'open_tickets_by_priority', type: 'pie', width: 'md', height: 'md', customTitle: 'Open Tickets by Priority', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-open-status', kpiId: 'open_tickets_by_status', type: 'bar', width: 'md', height: 'md', customTitle: 'Open Tickets by Status', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-open-team', kpiId: 'open_tickets_by_issue_owner_team', type: 'bar', width: 'md', height: 'md', customTitle: 'Open Tickets by Owner Team', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-cycle-time', kpiId: 'cycle_time_histogram', type: 'bar', width: 'md', height: 'md', customTitle: 'Cycle Time Distribution', jqlFilter: { enabled: false, query: '', mode: 'override' } },
  { id: 'chart-no-comment', kpiId: 'no_comment_followup', type: 'bar', width: 'full', height: 'md', customTitle: 'Awaiting Follow-up (No Recent Comment)', jqlFilter: { enabled: false, query: '', mode: 'override' } },
];

const db = new DatabaseSync(DB_PATH, { readOnly: true });

const row = db.prepare('SELECT * FROM DashboardView WHERE name = ?').get(VIEW_NAME);
if (!row) {
  console.error(`View "${VIEW_NAME}" not found in ${DB_PATH}`);
  process.exit(1);
}

// Full data range of the master dataset — matches the app's MAX preset behavior
const range = db.prepare('SELECT MIN(created) AS minC, MAX(created) AS maxC FROM MasterTicket').get();
db.close();
const dateFrom = new Date(range.minC).toISOString().split('T')[0];
const dateTo = new Date(range.maxC).toISOString().split('T')[0];

const data = JSON.parse(row.data);
const existingCharts = Array.isArray(data.charts) ? data.charts : [];
const existingKpis = new Set(existingCharts.map((c) => c.kpiId));
const mergedCharts = [
  ...existingCharts,
  ...RECOMMENDED_CHARTS.filter((c) => !existingKpis.has(c.kpiId)),
];

const updatedData = {
  ...data,
  dateFrom,
  dateTo,
  charts: mergedCharts,
};
// MAX range instead of the saved 90-day window (sparsity on trend charts);
// the loader falls back to exact dates when no preset is present.
delete updatedData.selectedPeriodPreset;

const view = {
  id: row.id,
  name: row.name,
  connectionRef: row.connectionRef,
  isDefault: !!row.isDefault,
  autoSaveEnabled: !!row.autoSaveEnabled,
  data: updatedData,
};

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
config.databaseViews = [view];
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');

console.log(`View "${row.name}" (${row.id})`);
console.log(`  existing charts kept: ${existingCharts.length} (${existingCharts.map((c) => c.kpiId).join(', ')})`);
console.log(`  charts added: ${mergedCharts.length - existingCharts.length}`);
console.log(`  date range: ${dateFrom} -> ${dateTo} (MAX)`);
console.log(`Wrote databaseViews to ${CONFIG_PATH}`);
