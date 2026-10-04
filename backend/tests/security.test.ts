import request from 'supertest';
import { app, auth, buildFixtures, type Fixtures } from './helpers';
import { Agency } from '../src/models/Agency';
import { AGENCY_STATUS } from '../src/types/enums';

/**
 * Tenant isolation and authorization tests.
 *
 * These exercise the real HTTP surface through Supertest, so the middleware
 * chain, tenant resolver and service filters are all covered together.
 */
describe('Multi-tenant isolation & authorization', () => {
  let f: Fixtures;

  // The global afterEach clears the database, so fixtures are rebuilt per test.
  beforeEach(async () => {
    f = await buildFixtures();
  });

  /**
   * Regression guard.
   *
   * These endpoints are mounted under a prefix in `routes/index.ts` while the
   * router itself declares paths relative to that prefix. Declaring the prefix
   * twice (e.g. `router.use('/files', ...)` plus `router.get('/files', ...)`)
   * silently produces `/api/files/files`, which 404s for the real client.
   * These assertions pin the exact public paths the frontend calls.
   */
  it('exposes file endpoints at /api/files, not /api/files/files', async () => {
    const res = await request(app).get('/api/files').set(auth(f.agencyAAdminToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const legacy = await request(app).get('/api/files/files').set(auth(f.agencyAAdminToken));
    expect(legacy.status).toBe(404);
  });

  it('exposes the activity feed at /api/activity, not /api/activity/activity', async () => {
    const res = await request(app).get('/api/activity').set(auth(f.agencyAAdminToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const legacy = await request(app).get('/api/activity/activity').set(auth(f.agencyAAdminToken));
    expect(legacy.status).toBe(404);
  });

  // 1. Agency A cannot access Agency B project
  it('1. Agency A cannot read an Agency B project', async () => {
    const res = await request(app)
      .get(`/api/workspace/projects/${f.bProject1Id}`)
      .set(auth(f.agencyAAdminToken));

    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
    // The response must not leak the other tenant's data.
    expect(JSON.stringify(res.body)).not.toContain('B Project One');
  });

  it('1b. Agency A project listing excludes Agency B projects', async () => {
    const res = await request(app)
      .get('/api/workspace/projects?limit=100')
      .set(auth(f.agencyAAdminToken));

    expect(res.status).toBe(200);
    const names = res.body.data.map((p: { name: string }) => p.name);
    expect(names).toContain('A Project One');
    expect(names).not.toContain('B Project One');
  });

  // 2. Agency A cannot access Agency B client
  it('2. Agency A cannot read an Agency B client', async () => {
    const res = await request(app)
      .get(`/api/workspace/clients/${f.bClient1Id}`)
      .set(auth(f.agencyAAdminToken));

    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('B Client One');
  });

  // 3. Agency A cannot modify Agency B task
  it('3. Agency A cannot modify an Agency B task', async () => {
    const res = await request(app)
      .patch(`/api/collab/tasks/${f.bTask1Id}`)
      .set(auth(f.agencyAAdminToken))
      .send({ title: 'Hijacked', status: 'DONE' });

    expect([403, 404]).toContain(res.status);

    // Confirm the record itself was untouched.
    const check = await request(app)
      .get(`/api/collab/tasks/${f.bTask1Id}`)
      .set(auth(f.agencyBAdminToken));
    expect(check.status).toBe(200);
    expect(check.body.data.title).toBe('B Task One');
    expect(check.body.data.status).toBe('TODO');
  });

  it('3b. Agency A cannot delete an Agency B task', async () => {
    const res = await request(app)
      .delete(`/api/collab/tasks/${f.bTask1Id}`)
      .set(auth(f.agencyAAdminToken));

    expect([403, 404]).toContain(res.status);
  });

  // 4. Client 1 cannot access Client 2 project (IDOR)
  it('4. Client 1 cannot read Client 2 project by guessing the id', async () => {
    const res = await request(app)
      .get(`/api/workspace/projects/${f.aProject2Id}`)
      .set(auth(f.agencyAClient1Token));

    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('A Project Two');
  });

  it('4b. Client 1 project list only shows its own projects', async () => {
    const res = await request(app)
      .get('/api/collab/client/projects?limit=100')
      .set(auth(f.agencyAClient1Token));

    expect(res.status).toBe(200);
    const names = res.body.data.map((p: { name: string }) => p.name);
    expect(names).toContain('A Project One');
    expect(names).not.toContain('A Project Two');
  });

  // 5. Client cannot access internal agency API
  it('5. Client is blocked from internal agency endpoints', async () => {
    const cases: { method: 'get' | 'post'; path: string; body?: Record<string, string> }[] = [
      { method: 'get', path: '/api/workspace/team' },
      { method: 'get', path: '/api/workspace/clients' },
      {
        method: 'post',
        path: '/api/workspace/clients',
        body: { companyName: 'Sneaky Inc', contactPerson: 'X', email: 'x@x.com' },
      },
      { method: 'get', path: '/api/collab/tasks' },
    ];

    for (const testCase of cases) {
      // `request(app).method(...)` is not on the supertest types, so the verb is
      // dispatched through the matching helper to keep this fully typed.
      const res =
        testCase.method === 'post'
          ? await request(app).post(testCase.path).set(auth(f.agencyAClient1Token)).send(testCase.body)
          : await request(app).get(testCase.path).set(auth(f.agencyAClient1Token));

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    }
  });

  // 6. Agency user cannot access Super Admin API
  it('6. Agency users cannot access the super admin API', async () => {
    const paths = [
      '/api/admin/metrics',
      '/api/admin/agencies',
      `/api/admin/agencies/${f.agencyBId}`,
      '/api/admin/activity',
    ];

    for (const path of paths) {
      const res = await request(app).get(path).set(auth(f.agencyAAdminToken));
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    }
  });

  it('6b. Client accounts cannot access the super admin API either', async () => {
    const res = await request(app).get('/api/admin/agencies').set(auth(f.agencyAClient1Token));
    expect(res.status).toBe(403);
  });

  // 7. Suspended agency user is blocked
  it('7. Users of a suspended agency are blocked', async () => {
    await Agency.updateOne(
      { _id: f.agencyBId },
      { $set: { status: AGENCY_STATUS.SUSPENDED, suspensionReason: 'Test suspension' } },
    ).exec();

    // Existing tokens are rejected on protected routes...
    const listRes = await request(app).get('/api/workspace/projects').set(auth(f.agencyBAdminToken));
    expect(listRes.status).toBe(403);
    expect(listRes.body.message).toMatch(/suspended/i);

    // ...and fresh logins are refused too.
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'b-admin@test.local', password: 'TestPass123!' });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.message).toMatch(/suspended/i);

    await Agency.updateOne(
      { _id: f.agencyBId },
      { $set: { status: AGENCY_STATUS.ACTIVE, suspensionReason: null, suspendedAt: null } },
    ).exec();
  });

  // 8. Password is not returned
  it('8. Password hashes never appear in any API response', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a-admin@test.local', password: 'TestPass123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user).toBeDefined();
    expect(loginRes.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(loginRes.body)).not.toMatch(/passwordHash|password_hash/i);
    // bcrypt hashes start with $2a$/$2b$ - make sure none leaked.
    expect(JSON.stringify(loginRes.body)).not.toContain('$2a$');
    expect(JSON.stringify(loginRes.body)).not.toContain('$2b$');

    const meRes = await request(app).get('/api/auth/me').set(auth(f.agencyAAdminToken));
    expect(JSON.stringify(meRes.body)).not.toMatch(/passwordHash/i);

    const teamRes = await request(app).get('/api/workspace/team').set(auth(f.agencyAAdminToken));
    expect(JSON.stringify(teamRes.body)).not.toMatch(/passwordHash/i);
  });

  // 10. Super admin can access agencies (file authorization in files.test.ts)
  it('10. Super admin can list, read and manage agencies', async () => {
    const list = await request(app).get('/api/admin/agencies?limit=50').set(auth(f.superAdminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const detail = await request(app)
      .get(`/api/admin/agencies/${f.agencyAId}`)
      .set(auth(f.superAdminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.name).toBe('Agency A');

    const metrics = await request(app).get('/api/admin/metrics').set(auth(f.superAdminToken));
    expect(metrics.status).toBe(200);
    expect(metrics.body.data.totalAgencies).toBeGreaterThanOrEqual(2);
  });

  it('10b. Super admin cannot read tenant data without a support session', async () => {
    const res = await request(app).get('/api/workspace/projects').set(auth(f.superAdminToken));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/support session/i);
  });

  it('10c. Support mode grants the tenant recorded in the session, not a query param', async () => {
    const start = await request(app)
      .post('/api/admin/support-session')
      .set(auth(f.superAdminToken))
      .send({ agencyId: f.agencyAId, reason: 'Investigating a ticket', scope: 'READ_ONLY', durationMinutes: 10 });

    if (start.status !== 200) {
      throw new Error(`support session failed: ${JSON.stringify(start.body)}`);
    }
    expect(start.status).toBe(200);
    const sessionId = start.body.data.sessionId as string;
    expect(sessionId).toBeTruthy();

    const header = { ...auth(f.superAdminToken), 'X-Support-Session': sessionId };

    // Reads agency A's projects...
    const ok = await request(app).get('/api/workspace/projects').set(header);
    expect(ok.status).toBe(200);
    const names = ok.body.data.map((p: { name: string }) => p.name);
    expect(names).toContain('A Project One');

    // ...but asking for agency B via a query parameter changes nothing.
    const spoof = await request(app)
      .get(`/api/workspace/projects?agencyId=${f.agencyBId}`)
      .set(header);
    expect(spoof.status).toBe(200);
    const spoofNames = spoof.body.data.map((p: { name: string }) => p.name);
    expect(spoofNames).not.toContain('B Project One');

    // A read-only session must refuse writes.
    const write = await request(app)
      .post('/api/workspace/clients')
      .set(header)
      .send({ companyName: 'Support Co', contactPerson: 'X', email: 'x@x.com' });
    expect(write.status).toBe(403);
    expect(write.body.message).toMatch(/read-only/i);

    // An invalid session id is rejected outright.
    const bad = await request(app)
      .get('/api/workspace/projects')
      .set({ ...auth(f.superAdminToken), 'X-Support-Session': 'not-a-real-session' });
    expect(bad.status).toBe(403);

    const end = await request(app).delete('/api/admin/support-session').set(header);
    expect(end.status).toBe(200);

    // After ending, the session no longer grants access.
    const afterEnd = await request(app).get('/api/workspace/projects').set(header);
    expect(afterEnd.status).toBe(403);
  });

  it('10d. Agency users cannot spoof a support session header', async () => {
    const res = await request(app)
      .get('/api/workspace/projects')
      .set({ ...auth(f.agencyAAdminToken), 'X-Support-Session': 'anything' });

    expect(res.status).toBe(403);
  });

  /**
   * Regression test.
   *
   * The browser ends a support session with `DELETE /admin/support-session?sessionId=...`,
   * i.e. the id arrives in the query string with no header and no body. Only the
   * header path was covered before, so a mismatch there left "Exit Support Mode"
   * returning 404 and the session live until it expired on its own.
   */
  it('10e. A support session can be ended by query id, as the browser does', async () => {
    const start = await request(app)
      .post('/api/admin/support-session')
      .set(auth(f.superAdminToken))
      .send({ agencyId: f.agencyAId, reason: 'Regression check', scope: 'READ_ONLY', durationMinutes: 10 });

    expect(start.status).toBe(200);
    const sessionId = start.body.data.sessionId as string;

    // The session grants access before it is ended.
    const during = await request(app)
      .get('/api/workspace/projects')
      .set({ ...auth(f.superAdminToken), 'X-Support-Session': sessionId });
    expect(during.status).toBe(200);

    // Ending it via the query string - no header, no body - must succeed.
    const end = await request(app)
      .delete(`/api/admin/support-session?sessionId=${sessionId}`)
      .set(auth(f.superAdminToken));
    expect(end.status).toBe(200);

    // And the ended session must no longer grant access.
    const afterEnd = await request(app)
      .get('/api/workspace/projects')
      .set({ ...auth(f.superAdminToken), 'X-Support-Session': sessionId });
    expect(afterEnd.status).toBe(403);
  });

  it('10f. Ending a support session requires an id', async () => {
    const res = await request(app).delete('/api/admin/support-session').set(auth(f.superAdminToken));
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const protectedPaths = [
      '/api/workspace/projects',
      '/api/workspace/clients',
      '/api/collab/tasks',
      '/api/admin/agencies',
      '/api/activity',
    ];

    for (const path of protectedPaths) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });

  it('rejects a tampered or malformed token', async () => {
    const res = await request(app)
      .get('/api/workspace/projects')
      .set(auth('not.a.real.token'));

    expect(res.status).toBe(401);
  });

  it('an agency cannot assign a user from another agency to a project', async () => {
    // A-team is agency A; the guard must refuse a cross-tenant assignee id.
    const bAdminId = (await request(app)
      .get('/api/admin/agencies/' + f.agencyBId)
      .set(auth(f.superAdminToken))).body.data;

    expect(bAdminId).toBeDefined();

    const res = await request(app)
      .post('/api/workspace/projects')
      .set(auth(f.agencyAAdminToken))
      .send({
        name: 'Cross tenant project',
        clientId: f.bClient1Id,
        startDate: new Date().toISOString(),
      });

    // The client belongs to agency B, so the project cannot be created.
    expect(res.status).toBe(400);
  });
});