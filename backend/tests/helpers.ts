import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../src/app';
import { Agency } from '../src/models/Agency';
import { User } from '../src/models/User';
import { Client } from '../src/models/Client';
import { Project } from '../src/models/Project';
import { Task } from '../src/models/Task';
import { hashPassword } from '../src/utils/crypto';
import { AGENCY_STATUS, PLANS, PRIORITIES, PROJECT_STATUS, ROLES, TASK_STATUS } from '../src/types/enums';

export const TEST_PASSWORD = 'TestPass123!';

export const app: Application = createApp();

/** Authenticates and returns the access token. */
export async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Fixtures {
  superAdminToken: string;
  agencyAId: string;
  agencyBId: string;
  agencyAAdminToken: string;
  agencyATeamToken: string;
  agencyAClient1Token: string;
  agencyAClient2Token: string;
  agencyBAdminToken: string;
  agencyBClientToken: string;
  aClient1Id: string;
  aClient2Id: string;
  aProject1Id: string;
  aProject2Id: string;
  aTask1Id: string;
  bClient1Id: string;
  bProject1Id: string;
  bTask1Id: string;
}

/**
 * Password hash is computed once and reused: bcrypt is intentionally slow, and
 * every fixture user shares the same password.
 */
let cachedHash: string | null = null;

async function testPasswordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await hashPassword(TEST_PASSWORD);
  return cachedHash;
}

/**
 * Builds two isolated tenants plus a super admin and client accounts.
 * Each tenant gets its own clients, projects and tasks.
 *
 * Call this from `beforeEach`: the global `afterEach` clears the database, so
 * fixtures must be rebuilt per test.
 */
export async function buildFixtures(): Promise<Fixtures> {
  const passwordHash = await testPasswordHash();

  await User.create({
    name: 'Platform Admin', email: 'admin@test.local', passwordHash,
    role: ROLES.SUPER_ADMIN, agencyId: null, clientId: null, isActive: true,
  });

  const agencyA = await Agency.create({
    name: 'Agency A', ownerName: 'Owner A', email: 'a@test.local',
    status: AGENCY_STATUS.ACTIVE, plan: PLANS.PROFESSIONAL,
  });
  const agencyB = await Agency.create({
    name: 'Agency B', ownerName: 'Owner B', email: 'b@test.local',
    status: AGENCY_STATUS.ACTIVE, plan: PLANS.STARTER,
  });

  const aAdmin = await User.create({
    name: 'A Admin', email: 'a-admin@test.local', passwordHash,
    role: ROLES.AGENCY_ADMIN, agencyId: agencyA._id, isActive: true,
  });
  const aTeam = await User.create({
    name: 'A Team', email: 'a-team@test.local', passwordHash,
    role: ROLES.AGENCY_TEAM, agencyId: agencyA._id, isActive: true,
  });
  const bAdmin = await User.create({
    name: 'B Admin', email: 'b-admin@test.local', passwordHash,
    role: ROLES.AGENCY_ADMIN, agencyId: agencyB._id, isActive: true,
  });

  const aClient1 = await Client.create({
    agencyId: agencyA._id, companyName: 'A Client One',
    contactPerson: 'Contact One', email: 'ac1@test.local', isActive: true,
  });
  const aClient2 = await Client.create({
    agencyId: agencyA._id, companyName: 'A Client Two',
    contactPerson: 'Contact Two', email: 'ac2@test.local', isActive: true,
  });
  const bClient1 = await Client.create({
    agencyId: agencyB._id, companyName: 'B Client One',
    contactPerson: 'Contact B', email: 'bc1@test.local', isActive: true,
  });

  // Client logins, one per client company (Client 1 and Client 2 in agency A).
  await User.create({
    name: 'A Client User 1', email: 'a-client1@test.local', passwordHash,
    role: ROLES.CLIENT, agencyId: agencyA._id, clientId: aClient1._id, isActive: true,
  });
  await User.create({
    name: 'A Client User 2', email: 'a-client2@test.local', passwordHash,
    role: ROLES.CLIENT, agencyId: agencyA._id, clientId: aClient2._id, isActive: true,
  });
  await User.create({
    name: 'B Client User', email: 'b-client@test.local', passwordHash,
    role: ROLES.CLIENT, agencyId: agencyB._id, clientId: bClient1._id, isActive: true,
  });

  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const aProject1 = await Project.create({
    agencyId: agencyA._id, clientId: aClient1._id, name: 'A Project One',
    status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.HIGH,
    startDate: start, expectedCompletionDate: due, projectManagerId: aAdmin._id,
  });
  const aProject2 = await Project.create({
    agencyId: agencyA._id, clientId: aClient2._id, name: 'A Project Two',
    status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.MEDIUM,
    startDate: start, expectedCompletionDate: due, projectManagerId: aAdmin._id,
  });
  const bProject1 = await Project.create({
    agencyId: agencyB._id, clientId: bClient1._id, name: 'B Project One',
    status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.HIGH,
    startDate: start, expectedCompletionDate: due, projectManagerId: bAdmin._id,
  });

  const aTask1 = await Task.create({
    agencyId: agencyA._id, projectId: aProject1._id, milestoneId: null,
    title: 'A Task One', assigneeId: aTeam._id, createdBy: aAdmin._id,
    status: TASK_STATUS.TODO, priority: PRIORITIES.MEDIUM,
  });
  const bTask1 = await Task.create({
    agencyId: agencyB._id, projectId: bProject1._id, milestoneId: null,
    title: 'B Task One', assigneeId: bAdmin._id, createdBy: bAdmin._id,
    status: TASK_STATUS.TODO, priority: PRIORITIES.MEDIUM,
  });

  return {
    superAdminToken: await login('admin@test.local'),
    agencyAId: String(agencyA._id),
    agencyBId: String(agencyB._id),
    agencyAAdminToken: await login('a-admin@test.local'),
    agencyATeamToken: await login('a-team@test.local'),
    agencyAClient1Token: await login('a-client1@test.local'),
    agencyAClient2Token: await login('a-client2@test.local'),
    agencyBAdminToken: await login('b-admin@test.local'),
    agencyBClientToken: await login('b-client@test.local'),
    aClient1Id: String(aClient1._id),
    aClient2Id: String(aClient2._id),
    aProject1Id: String(aProject1._id),
    aProject2Id: String(aProject2._id),
    aTask1Id: String(aTask1._id),
    bClient1Id: String(bClient1._id),
    bProject1Id: String(bProject1._id),
    bTask1Id: String(bTask1._id),
  };
}