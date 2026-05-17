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

  try {
    // Get all master tickets that don't have issueOwnerTeam but have rawData
    const tickets = await prisma.masterTicket.findMany({
      where: {
        issueOwnerTeam: null
      },
      select: {
        id: true,
        jiraKey: true,
        rawData: true
      },
      take: 1000 // Process in batches
    });

    console.log(`Found ${tickets.length} tickets to backfill...\n`);

    let updated = 0;
    let skipped = 0;

    for (const ticket of tickets) {
      try {
        let rawData;
        try {
          rawData = JSON.parse(ticket.rawData);
        } catch (e) {
          console.log(`[${ticket.jiraKey}] Failed to parse rawData`);
          skipped++;
          continue;
        }

        // Extract from the exact same field path
        const customfield_10132 = rawData?.fields?.customfield_10132;
        let issueOwnerTeam = null;

        if (customfield_10132) {
          // Handle both string and object formats
          if (typeof customfield_10132 === 'string') {
            issueOwnerTeam = customfield_10132;
          } else if (typeof customfield_10132 === 'object' && customfield_10132?.value) {
            issueOwnerTeam = customfield_10132.value;
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
          console.log(`[${ticket.jiraKey}] - No customfield_10132 value`);
        }
      } catch (err) {
        console.error(`[${ticket.jiraKey}] Error:`, err.message);
        skipped++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`✓ Updated: ${updated}`);
    console.log(`⊘ Skipped: ${skipped}`);
    console.log(`\nRemaining tickets to process: ${tickets.length - updated - skipped}`);

    if (tickets.length === 1000) {
      console.log('\n⚠️  More tickets remain - run script again to process next batch');
    }

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillIssueOwnerTeam();
