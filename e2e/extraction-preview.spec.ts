import { test, expect } from '@playwright/test';
import { gotoHome, seedConnection } from './helpers';

// Alignment contract for the extraction preview list (ExtractionPreviewTable).
//
// The list is a flex "table": each row lays out key | summary | assignee |
// status badge. Two properties make its text columns read as a table instead
// of a pile of floats, and both are easy to regress silently with a class
// tweak — so they are pinned geometrically here:
//
// 1. Every text column in a row sits on ONE baseline. The row used
//    `items-center`, which centers line boxes; the mono key font splits its
//    ascent/descent differently from the UI sans, so the key visually floated
//    ~1px above the neighbouring text. The row now uses `items-baseline`.
// 2. The summary column starts at the same x in every row. The key column has
//    a fixed width (w-28 sm:w-32) with truncation, so rows with different key
//    lengths no longer shift the summary/assignee/badge columns sideways.
//
// Baselines are measured as (text run top + canvas fontBoundingBoxAscent) —
// comparing run boxes directly cannot see the defect, because co-centered
// line boxes keep run *centers* equal even when baselines differ.

const ISSUES = [
  {
    key: 'AB-1',
    fields: {
      summary: 'Short summary',
      status: { name: 'Done' },
      assignee: { displayName: 'Alice Anderson' },
      created: '2026-01-05T10:00:00Z',
      updated: '2026-02-01T10:00:00Z',
      resolutiondate: '2026-02-01T10:00:00Z',
    },
  },
  {
    key: 'ABCDE-12345',
    fields: {
      summary: 'A much longer summary that describes the ticket in greater detail for layout testing',
      status: { name: 'In Progress' },
      assignee: { displayName: 'Bob Robertson-Smith' },
      created: '2026-01-06T10:00:00Z',
      updated: '2026-02-02T10:00:00Z',
    },
  },
  {
    key: 'XY-999',
    fields: {
      summary: 'Unassigned open ticket with a mid-length summary line',
      status: { name: 'Open' },
      assignee: null,
      created: '2026-01-07T10:00:00Z',
      updated: '2026-02-03T10:00:00Z',
    },
  },
  {
    key: 'LONGPROJECTKEY-42',
    fields: {
      summary: 'Summary on a row whose key exceeds the fixed key column width',
      status: { name: 'To Do' },
      assignee: { displayName: 'David' },
      created: '2026-01-09T10:00:00Z',
      updated: '2026-02-05T10:00:00Z',
    },
  },
];

interface ColumnGeometry {
  baseline: number;
  left: number;
}

interface RowGeometry {
  key: ColumnGeometry;
  summary: ColumnGeometry;
  assignee: ColumnGeometry;
  badge: ColumnGeometry;
  height: number;
}

async function openExtractionPreview(page: import('@playwright/test').Page) {
  seedConnection(page, {
    name: 'E2E Alignment Seed',
    baseUrl: 'https://e2e.invalid',
    email: 'e2e@example.com',
    apiToken: 'e2e-token',
  });

  // A seeded connection makes the app restore the master dataset on mount,
  // which auto-populates the extraction preview list. Serving the payload via
  // a route mock keeps the test independent of the local SQLite contents.
  await page.route('**/api/jira/master/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          totalExtracted: ISSUES.length,
          issues: ISSUES,
          dateRange: { from: '2026-01-05T10:00:00.000Z', to: '2026-02-05T10:00:00.000Z' },
          lastUpdated: '2026-02-05T10:00:00.000Z',
        },
      }),
    })
  );

  await gotoHome(page);
  await expect(page.locator('a[href*="/browse/"]')).toHaveCount(ISSUES.length);
}

async function measureRows(page: import('@playwright/test').Page): Promise<RowGeometry[]> {
  return page.evaluate(() => {
    // Canvas TextMetrics give the font's ascent for the inline text box, so
    // baseline = runBox.top + fontAscent, comparable across fonts and sizes.
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    const baselineOf = (el: Element): ColumnGeometry => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      const font = getComputedStyle(el).font;
      ctx.font = font;
      const ascent = ctx.measureText((el.textContent || 'Ag').slice(0, 40)).fontBoundingBoxAscent;
      return { baseline: rect.top + ascent, left: rect.left };
    };

    const rows: RowGeometry[] = [];
    for (const keyEl of document.querySelectorAll('a[href*="/browse/"]')) {
      const row = keyEl.parentElement;
      const spans = row?.querySelectorAll(':scope > span');
      const badge = row?.querySelector('[data-slot="badge"]');
      if (!row || !spans || spans.length < 2 || !badge) continue;
      rows.push({
        key: baselineOf(keyEl),
        summary: baselineOf(spans[0]),
        assignee: baselineOf(spans[1]),
        badge: baselineOf(badge),
        height: row.getBoundingClientRect().height,
      });
    }
    return rows;
  });
}

test.describe('Extraction preview list — text column alignment', () => {
  test('all text columns in a row share one baseline', async ({ page }) => {
    await openExtractionPreview(page);
    const rows = await measureRows(page);
    expect(rows).toHaveLength(ISSUES.length);

    // items-baseline locks key/summary/assignee/badge onto a single baseline.
    // 0.75px absorbs subpixel rounding but still fails the old items-center
    // rendering, where the mono key sat a full pixel above the sans columns.
    for (const row of rows) {
      for (const col of ['key', 'assignee', 'badge'] as const) {
        expect(Math.abs(row[col].baseline - row.summary.baseline)).toBeLessThanOrEqual(0.75);
      }
    }

    // Baseline alignment must not stretch the rows: 38px = py-2 (16) + the
    // 22px status badge line. Guard the rhythm against accidental changes.
    for (const row of rows) {
      expect(row.height).toBeGreaterThanOrEqual(36);
      expect(row.height).toBeLessThanOrEqual(40);
    }
  });

  test('summary column starts at the same x in every row', async ({ page }) => {
    await openExtractionPreview(page);
    const rows = await measureRows(page);
    expect(rows).toHaveLength(ISSUES.length);

    // The fixed-width, truncating key column keeps the summary edge straight
    // even for the LONGPROJECTKEY-42 row, whose key overflows the column.
    const lefts = rows.map((r) => r.summary.left);
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(0.5);

    // The overlong key is truncated (not wrapped) inside its fixed column and
    // keeps the full key available as the link tooltip.
    const longKeyLink = page.locator('a[href*="/browse/LONGPROJECTKEY-42"]');
    await expect(longKeyLink).toHaveAttribute('title', 'LONGPROJECTKEY-42');
  });
});
