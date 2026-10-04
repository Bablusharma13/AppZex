/**
 * Seed runner: wipes the demo database and repopulates it.
 *
 * Usage:  npm run seed
 *
 * Two independent tenants are created so that tenant isolation can be exercised
 * and demonstrated end to end.
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { SupportSession } from '../models/SupportSession';
import { DEMO_PASSWORD, daysAgo, seedCommunications, seedPlatform, seedWork, wipeAll, type SeedRefs } from './seedData';

const CREDENTIALS: { label: string; email: string; role: string }[] = [
  { label: 'Super Admin', email: 'admin@appzex-demo.com', role: 'SUPER_ADMIN' },
  { label: 'Agency A (Northstar Digital)', email: 'agency-a-admin@appzex-demo.com', role: 'AGENCY_ADMIN' },
  { label: 'Agency A', email: 'agency-a-team@appzex-demo.com', role: 'AGENCY_TEAM' },
  { label: 'Agency A client (Lumina Retail)', email: 'agency-a-client@appzex-demo.com', role: 'CLIENT' },
  { label: 'Agency B (Bluepeak Creative)', email: 'agency-b-admin@appzex-demo.com', role: 'AGENCY_ADMIN' },
  { label: 'Agency B client (Cascade Foods)', email: 'agency-b-client@appzex-demo.com', role: 'CLIENT' },
];

async function main(): Promise<void> {
  const refs: SeedRefs = {
    agencies: new Map(),
    users: new Map(),
    clients: new Map(),
    projects: new Map(),
    milestones: new Map(),
  };

  logger.info('seed.started');
  await connectDatabase();
  await wipeAll();

  const superAdminId = await seedPlatform(refs);
  await seedWork(refs);
  await seedCommunications(refs);

  // A finished support session, so the agency detail page shows audit history.
  const agencyB = refs.agencies.get('b');
  if (agencyB) {
    await SupportSession.create({
      sessionId: 'seeded-completed-support-session',
      agencyId: agencyB,
      superAdminId,
      superAdminName: 'AppZex Platform Admin',
      scope: 'READ_ONLY',
      reason: 'Investigating a customer-reported login issue',
      expiresAt: daysAgo(1),
      endedAt: daysAgo(1),
      endedReason: 'Resolved with the agency admin',
    });
  }

  const counts = {
    agencies: refs.agencies.size,
    users: refs.users.size,
    clients: refs.clients.size,
    projects: refs.projects.size,
  };

  logger.info('seed.completed', counts);

  const line = '='.repeat(64);
  console.log(`\n${line}`);
  console.log(' AppZex AgencyOS - demo data seeded');
  console.log(line);
  console.log(`\n  Demo password for every account: ${DEMO_PASSWORD}\n`);
  for (const cred of CREDENTIALS) {
    console.log(`  ${cred.label.padEnd(34)} ${cred.email.padEnd(38)} ${cred.role}`);
  }
  console.log(`\n  ${counts.agencies} agencies | ${counts.users} users | ${counts.clients} clients | ${counts.projects} projects`);
  console.log(`\n${line}\n`);

  await disconnectDatabase();
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    logger.error('seed.failed', { error: error.message, stack: error.stack });
    console.error('\n[seed] Failed:', error.message);
    process.exit(1);
  });