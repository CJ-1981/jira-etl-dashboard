
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./prisma/db/custom.db',
    },
  },
});

async function run() {
  console.log('--- Large Scale Extraction Simulation ---');
  const count = 1500;
  const connectionRef = 'test-repro-connection';

  // 1. Generate large mock data
  console.log(`Generating ${count} issues...`);
  const issues = Array.from({ length: count }, (_, i) => ({
    key: `TEST-${i}`,
    fields: {
      summary: `Issue ${i} with a very long summary to increase memory usage. `.repeat(10),
      issuetype: { name: 'Task' },
      priority: { name: 'Medium' },
      status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
      assignee: { displayName: 'John Doe' },
      reporter: { displayName: 'Jane Smith' },
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      labels: ['reproduction', 'scaling', 'test'],
      components: [{ name: 'Core' }],
    },
    changelog: {
      histories: Array.from({ length: 5 }, (_, j) => ({
        created: new Date().toISOString(),
        author: { displayName: 'User' },
        items: [{ field: 'status', fromString: 'Open', toString: 'In Progress' }]
      }))
    }
  }));

  console.log('Simulating database operations...');
  
  try {
    // Simulate the part of the code that loads EVERYTHING from the master dataset
    // This is likely where the OOM or stability issue occurs
    console.log('Step 1: Inserting snapshots (createMany simulation)...');
    const snapshotData = issues.map(issue => ({
      etlRunId: 'dummy-run-id',
      jiraKey: issue.key,
      summary: issue.fields.summary,
      issueType: issue.fields.issuetype.name,
      priority: issue.fields.priority.name,
      status: issue.fields.status.name,
      assignee: issue.fields.assignee.displayName,
      reporter: issue.fields.reporter.displayName,
      created: new Date(issue.fields.created),
      updated: new Date(issue.fields.updated),
      rawData: JSON.stringify(issue),
    }));
    
    // Chunked insert to avoid SQLite parameter limit but still heavy
    const chunkSize = 100;
    for (let i = 0; i < snapshotData.length; i += chunkSize) {
      console.log(`  Inserting chunk ${i / chunkSize + 1}...`);
      // We skip actual db insert in reproduction if we just want to test memory of processing
    }

    console.log('Step 2: Simulating master dataset JSON parsing (The Bottleneck)...');
    // This simulates the lines:
    // const masterTickets = await db.masterTicket.findMany({ where: { connectionRef } });
    // const allIssues = masterTickets.map(t => JSON.parse(t.rawData));
    
    const mockMasterTickets = issues.map(issue => ({
      jiraKey: issue.key,
      rawData: JSON.stringify(issue)
    }));

    console.log(`Attempting to parse ${mockMasterTickets.length} JSON blobs...`);
    const startTime = Date.now();
    const allIssues = mockMasterTickets.map(t => JSON.parse(t.rawData));
    console.log(`Parsed ${allIssues.length} issues in ${Date.now() - startTime}ms`);

    console.log('SUCCESS: Memory handled the load.');
  } catch (error) {
    console.error('FAILED:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
