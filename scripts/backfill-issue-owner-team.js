#!/usr/bin/env node

/**
 * Backfill issueOwnerTeam field from existing rawData
 * Run this after updating the database schema to populate existing records
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || 'file:./db/custom.db'
});

async function backfillIssueOwnerTeam() {
  console.log('=== Backfilling Issue Owner Team Field ===\n');

  const cursorArgIndex = process.argv.indexOf('--cursor');
  const startCursor = cursorArgIndex !== -1 ? parseInt(process.argv[cursorArgIndex + 1], 10) : null;
  const batchSize = 1000;

  try {
    const initialTotal = await prisma.masterTicket.count({
      where: { issueOwnerTeam: null }
    });

    // Get master tickets that don't have issueOwnerTeam but have rawData using deterministic cursor
    const tickets = await prisma.masterTicket.findMany({
      where: {
        issueOwnerTeam: null
      },
      select: {
        id: true,
        jiraKey: true,
        rawData: true
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(startCursor ? { cursor: { id: startCursor }, skip: 1 } : {})
    });

    console.log(`Found ${initialTotal} total tickets needing backfill (${tickets.length} in this batch)...\n`);

    let updated = 0;
    let skipped = 0;
    let lastSeenId = startCursor;

    for (const ticket of tickets) {
      lastSeenId = ticket.id;
      try {
        let rawData;
        try {
          rawData = JSON.parse(ticket.rawData);
        } catch (e) {
          console.log(`[${ticket.jiraKey}] Failed to parse rawData`);
          skipped++;
          continue;
        }

        // @MX:NOTE: Environment-configured custom field mapping for issueOwnerTeam extraction
        // @MX:WARN: Hardcoded field IDs (customfield_10132) are fragile and can break across different Jira instances
        // @MX:REASON: Maps Jira custom field contract for owner-team; ensure field ID matches target instance schema
        const teamFieldKey = process.env.REACT_APP_JIRA_ISSUE_OWNER_TEAM_FIELD || 'customfield_10132';
        const teamFieldValue = rawData?.fields?.[teamFieldKey];
        let issueOwnerTeam = null;

        if (teamFieldValue) {
          // Handle both string and object formats
          if (typeof teamFieldValue === 'string') {
            issueOwnerTeam = teamFieldValue;
          } else if (typeof teamFieldValue === 'object' && teamFieldValue?.value) {
            issueOwnerTeam = teamFieldValue.value;
          }
        }

        if (issueOwnerTeam) {
          await prisma.masterTicket.update({
            where: { id: ticket.id },
            data: { issueOwnerTeam }
          });
          updated++;
          console.log(`[${ticket.jiraKey}] ✓ Set to: ${issueOwnerTeam}`);
        } else {
          skipped++;
          console.log(`[${ticket.jiraKey}] - No ${teamFieldKey} value`);
        }
      } catch (err) {
        console.error(`[${ticket.jiraKey}] Error:`, err.message);
        skipped++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`✓ Updated: ${updated}`);
    console.log(`⊘ Skipped: ${skipped}`);
    console.log(`\nRemaining tickets to process: ${initialTotal - updated - skipped}`);

    if (tickets.length === batchSize && lastSeenId) {
      console.log(`\n⚠️  More tickets remain - run script with --cursor ${lastSeenId} to process next batch`);
    }

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillIssueOwnerTeam();
