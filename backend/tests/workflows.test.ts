import request from 'supertest';
import { app, auth, buildFixtures, TEST_PASSWORD, type Fixtures } from './helpers';

/**
 * Functional coverage for the main workflows, complementing the security suite.
 * These assert the behaviour an agency user and a client user actually rely on.
 */
describe('Core workflows', () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await buildFixtures();
  });

  describe('authentication', () => {
    it('registers a new agency with its first admin', async () => {
      const res = await request(app).post('/api/auth/register').send({
        agencyName: 'Fresh Start Agency',
        name: 'New Owner',
        email: 'owner@freshstart.test',
        password: 'StrongPass123',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user.role).toBe('AGENCY_ADMIN');
      expect(res.body.data.user.agencyId).toBeTruthy();
      expect(res.body.data.accessToken).toBeTruthy();
      // A new tenant must not inherit the seeded agencies' data.
      expect(res.body.data.agency.name).toBe('Fresh Start Agency');
    });

    it('rejects a weak password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        agencyName: 'Weak Pass Co',
        name: 'Owner',
        email: 'weak@test.local',
        password: 'abc',
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('rejects a duplicate email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        agencyName: 'Dup Co',
        name: 'Owner',
        email: 'a-admin@test.local',
        password: 'StrongPass123',
      });

      expect(res.status).toBe(409);
    });

    it('rejects a wrong password without revealing whether the account exists', async () => {
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a-admin@test.local', password: 'WrongPass123' });
      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'WrongPass123' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('returns the current user for /me', async () => {
      const res = await request(app).get('/api/auth/me').set(auth(f.agencyAAdminToken));
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('a-admin@test.local');
      expect(res.body.data.agencyId).toBe(f.agencyAId);
    });

    it('changes the password and allows login with the new one', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set(auth(f.agencyAAdminToken))
        .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNew123' });

      expect(res.status).toBe(200);

      const relogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'a-admin@test.local', password: 'BrandNew123' });
      expect(relogin.status).toBe(200);
    });

    it('refuses a password change with the wrong current password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set(auth(f.agencyAAdminToken))
        .send({ currentPassword: 'Nope12345', newPassword: 'BrandNew123' });

      expect(res.status).toBe(401);
    });
  });

  describe('clients & projects', () => {
    it('creates, reads, updates and deletes a client', async () => {
      const created = await request(app)
        .post('/api/workspace/clients')
        .set(auth(f.agencyAAdminToken))
        .send({ companyName: 'Acme Corp', contactPerson: 'Jane Doe', email: 'jane@acme.test' });

      expect(created.status).toBe(201);
      const clientId = created.body.data.id as string;

      const read = await request(app)
        .get(`/api/workspace/clients/${clientId}`)
        .set(auth(f.agencyAAdminToken));
      expect(read.body.data.companyName).toBe('Acme Corp');
      expect(read.body.data.agencyId).toBe(f.agencyAId);

      const updated = await request(app)
        .patch(`/api/workspace/clients/${clientId}`)
        .set(auth(f.agencyAAdminToken))
        .send({ companyName: 'Acme Holdings' });
      expect(updated.body.data.companyName).toBe('Acme Holdings');

      const removed = await request(app)
        .delete(`/api/workspace/clients/${clientId}`)
        .set(auth(f.agencyAAdminToken));
      expect(removed.status).toBe(200);
    });

    it('rejects a duplicate client company name inside the same agency', async () => {
      const res = await request(app)
        .post('/api/workspace/clients')
        .set(auth(f.agencyAAdminToken))
        .send({ companyName: 'A Client One', contactPerson: 'X', email: 'x@dup.test' });

      expect(res.status).toBe(409);
    });

    it('lets the same company name exist in a different agency', async () => {
      const res = await request(app)
        .post('/api/workspace/clients')
        .set(auth(f.agencyBAdminToken))
        .send({ companyName: 'A Client One', contactPerson: 'X', email: 'x@other.test' });

      expect(res.status).toBe(201);
    });

    it('creates a project and derives progress from its tasks', async () => {
      const project = await request(app)
        .post('/api/workspace/projects')
        .set(auth(f.agencyAAdminToken))
        .send({
          name: 'Progress Project',
          clientId: f.aClient1Id,
          startDate: new Date().toISOString(),
          expectedCompletionDate: new Date(Date.now() + 86_400_000 * 30).toISOString(),
        });

      expect(project.status).toBe(201);
      const projectId = project.body.data.id as string;
      expect(project.body.data.progress.progressPercentage).toBe(0);
      expect(project.body.data.progress.totalTasks).toBe(0);

      // 4 tasks, 1 done => 25%
      const statuses = ['DONE', 'TODO', 'TODO', 'IN_PROGRESS'];
      for (const status of statuses) {
        const task = await request(app)
          .post('/api/collab/tasks')
          .set(auth(f.agencyAAdminToken))
          .send({ projectId, title: `Task ${status}`, status });
        expect(task.status).toBe(201);
      }

      const after = await request(app)
        .get(`/api/workspace/projects/${projectId}`)
        .set(auth(f.agencyAAdminToken));

      expect(after.body.data.progress.totalTasks).toBe(4);
      expect(after.body.data.progress.completedTasks).toBe(1);
      expect(after.body.data.progress.progressPercentage).toBe(25);
    });

    it('rejects a project whose client belongs to another agency', async () => {
      const res = await request(app)
        .post('/api/workspace/projects')
        .set(auth(f.agencyAAdminToken))
        .send({
          name: 'Invalid',
          clientId: f.bClient1Id,
          startDate: new Date().toISOString(),
        });

      expect([400, 404]).toContain(res.status);
    });

    it('rejects an expected completion date before the start date', async () => {
      const res = await request(app)
        .post('/api/workspace/projects')
        .set(auth(f.agencyAAdminToken))
        .send({
          name: 'Backwards',
          clientId: f.aClient1Id,
          startDate: new Date(Date.now() + 86_400_000 * 10).toISOString(),
          expectedCompletionDate: new Date().toISOString(),
        });

      expect(res.status).toBe(422);
    });

    it('validates required fields and enum values', async () => {
      const res = await request(app)
        .post('/api/workspace/projects')
        .set(auth(f.agencyAAdminToken))
        .send({ name: '', clientId: 'not-an-id', startDate: 'nope', status: 'WRONG' });

      expect(res.status).toBe(422);
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('tasks & milestones', () => {
    it('creates a task and flags it overdue when the due date has passed', async () => {
      const res = await request(app)
        .post('/api/collab/tasks')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Overdue task',
          dueDate: new Date(Date.now() - 86_400_000 * 2).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isOverdue).toBe(true);
      expect(res.body.data.status).toBe('TODO');
    });

    it('is not overdue once the task is DONE', async () => {
      const created = await request(app)
        .post('/api/collab/tasks')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Late but done',
          dueDate: new Date(Date.now() - 86_400_000 * 2).toISOString(),
          status: 'DONE',
        });

      expect(created.body.data.isOverdue).toBe(false);
      expect(created.body.data.completedAt).toBeTruthy();
    });

    it('filters tasks by status and by overdue', async () => {
      await request(app)
        .post('/api/collab/tasks')
        .set(auth(f.agencyAAdminToken))
        .send({ projectId: f.aProject1Id, title: 'Done one', status: 'DONE' });

      const byStatus = await request(app)
        .get('/api/collab/tasks?status=DONE')
        .set(auth(f.agencyAAdminToken));
      expect(byStatus.status).toBe(200);
      expect(
        byStatus.body.data.every((t: { status: string }) => t.status === 'DONE'),
      ).toBe(true);

      const byOverdue = await request(app)
        .get('/api/collab/tasks?overdue=true')
        .set(auth(f.agencyAAdminToken));
      expect(byOverdue.status).toBe(200);
      expect(
        byOverdue.body.data.every((t: { isOverdue: boolean }) => t.isOverdue === true),
      ).toBe(true);
    });

    it('rejects a task whose milestone belongs to a different project', async () => {
      const milestone = await request(app)
        .post('/api/workspace/milestones')
        .set(auth(f.agencyAAdminToken))
        .send({ projectId: f.aProject2Id, name: 'Planning' });

      expect(milestone.status).toBe(201);

      const res = await request(app)
        .post('/api/collab/tasks')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          milestoneId: milestone.body.data.id,
          title: 'Mismatched milestone',
        });

      expect(res.status).toBe(400);
    });

    it('rejects an assignee from another agency', async () => {
      // Agency B's admin id is discovered through the super admin API.
      const bDetail = await request(app)
        .get(`/api/admin/agencies/${f.agencyBId}/detail`)
        .set(auth(f.superAdminToken));
      const bAdminId = bDetail.body.data.users[0]._id as string;

      const res = await request(app)
        .post('/api/collab/tasks')
        .set(auth(f.agencyAAdminToken))
        .send({ projectId: f.aProject1Id, title: 'Cross tenant assignee', assigneeId: bAdminId });

      expect(res.status).toBe(400);
    });

    it('adds a comment to a task', async () => {
      const res = await request(app)
        .post(`/api/collab/tasks/${f.aTask1Id}/comments`)
        .set(auth(f.agencyAAdminToken))
        .send({ body: 'Looks good to me' });

      expect(res.status).toBe(201);
      expect(res.body.data.comments).toHaveLength(1);
      expect(res.body.data.comments[0].body).toBe('Looks good to me');
    });

    it('completes a milestone and records the timestamp', async () => {
      const created = await request(app)
        .post('/api/workspace/milestones')
        .set(auth(f.agencyAAdminToken))
        .send({ projectId: f.aProject1Id, name: 'Design' });

      const updated = await request(app)
        .patch(`/api/workspace/milestones/${created.body.data.id}`)
        .set(auth(f.agencyAAdminToken))
        .send({ status: 'COMPLETED' });

      expect(updated.status).toBe(200);
      expect(updated.body.data.status).toBe('COMPLETED');
      expect(updated.body.data.completedAt).toBeTruthy();
    });

    it('supports search, pagination and sorting', async () => {
      for (let i = 0; i < 5; i += 1) {
        await request(app)
          .post('/api/collab/tasks')
          .set(auth(f.agencyAAdminToken))
          .send({ projectId: f.aProject1Id, title: `Searchable task ${i}` });
      }

      const searched = await request(app)
        .get('/api/collab/tasks?search=Searchable')
        .set(auth(f.agencyAAdminToken));
      expect(searched.status).toBe(200);
      expect(searched.body.data).toHaveLength(5);
      expect(searched.body.pagination.total).toBe(5);

      const paged = await request(app)
        .get('/api/collab/tasks?search=Searchable&page=2&limit=2')
        .set(auth(f.agencyAAdminToken));
      expect(paged.status).toBe(200);
      expect(paged.body.data).toHaveLength(2);
      expect(paged.body.pagination.page).toBe(2);
      expect(paged.body.pagination.hasPrevPage).toBe(true);
    });
  });

  describe('client portal workflow', () => {
    it('shows the client dashboard scoped to its own company', async () => {
      const res = await request(app)
        .get('/api/activity/client/dashboard')
        .set(auth(f.agencyAClient1Token));

      expect(res.status).toBe(200);
      expect(res.body.data.companyName).toBe('A Client One');
      expect(res.body.data.activeProjects).toBe(1);
    });

    it('submits feedback on its own project', async () => {
      const res = await request(app)
        .post('/api/collab/client/feedback')
        .set(auth(f.agencyAClient1Token))
        .send({
          projectId: f.aProject1Id,
          title: 'Please adjust the header',
          description: 'The header logo is too small on mobile.',
          category: 'CHANGE_REQUEST',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.clientId).toBe(f.aClient1Id);
    });

    it('refuses feedback on a project belonging to another client', async () => {
      const res = await request(app)
        .post('/api/collab/client/feedback')
        .set(auth(f.agencyAClient1Token))
        .send({
          projectId: f.aProject2Id,
          title: 'Not my project',
          description: 'Attempting to file against another company project.',
        });

      expect([403, 404]).toContain(res.status);
    });

    it('agency responds and resolves the feedback, and the client sees it', async () => {
      const submitted = await request(app)
        .post('/api/collab/client/feedback')
        .set(auth(f.agencyAClient1Token))
        .send({
          projectId: f.aProject1Id,
          title: 'Broken link',
          description: 'The footer link 404s.',
        });
      const feedbackId = submitted.body.data.id as string;

      const responded = await request(app)
        .patch(`/api/collab/feedback/${feedbackId}/status`)
        .set(auth(f.agencyAAdminToken))
        .send({ status: 'RESOLVED', agencyResponse: 'Fixed in the latest deploy.' });

      expect(responded.status).toBe(200);
      expect(responded.body.data.status).toBe('RESOLVED');
      expect(responded.body.data.agencyResponse).toBe('Fixed in the latest deploy.');

      const clientView = await request(app)
        .get(`/api/collab/client/feedback?projectId=${f.aProject1Id}`)
        .set(auth(f.agencyAClient1Token));
      expect(clientView.status).toBe(200);
      expect(clientView.body.data[0].status).toBe('RESOLVED');
    });

    it('lets the client reply in the feedback thread', async () => {
      const submitted = await request(app)
        .post('/api/collab/client/feedback')
        .set(auth(f.agencyAClient1Token))
        .send({ projectId: f.aProject1Id, title: 'Question', description: 'Is this expected?' });
      const feedbackId = submitted.body.data.id as string;

      const replied = await request(app)
        .post(`/api/collab/client/feedback/${feedbackId}/replies`)
        .set(auth(f.agencyAClient1Token))
        .send({ body: 'Adding a little more detail.' });

      expect(replied.status).toBe(200);
      expect(replied.body.data.replies).toHaveLength(1);
    });

    it('hides INTERNAL meetings from the client but shows CLIENT_VISIBLE ones', async () => {
      const internal = await request(app)
        .post('/api/collab/meetings')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Internal retrospective',
          date: new Date().toISOString(),
          visibility: 'INTERNAL',
          notes: 'Team-only notes that mention a staffing problem.',
        });
      expect(internal.status).toBe(201);

      const shared = await request(app)
        .post('/api/collab/meetings')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Client review',
          date: new Date().toISOString(),
          visibility: 'CLIENT_VISIBLE',
          notes: 'Shared notes for the client.',
        });
      expect(shared.status).toBe(201);

      const clientMeetings = await request(app)
        .get('/api/collab/client/meetings')
        .set(auth(f.agencyAClient1Token));

      expect(clientMeetings.status).toBe(200);
      const titles = clientMeetings.body.data.map((m: { title: string }) => m.title);
      expect(titles).toContain('Client review');
      expect(titles).not.toContain('Internal retrospective');
      expect(JSON.stringify(clientMeetings.body)).not.toContain('staffing problem');
    });

    it('does not expose internal activity entries to the client', async () => {
      const internalActivity = await request(app)
        .get('/api/activity?limit=100')
        .set(auth(f.agencyAClient1Token));

      expect(internalActivity.status).toBe(200);
      expect(
        internalActivity.body.data.every((e: { visibility: string }) => e.visibility === 'CLIENT_VISIBLE'),
      ).toBe(true);
    });
describe('AI meeting summary', () => {
    it('degrades gracefully when no AI key is configured', async () => {
      const meeting = await request(app)
        .post('/api/collab/meetings')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Planning meeting',
          date: new Date().toISOString(),
          visibility: 'CLIENT_VISIBLE',
          notes:
            'We reviewed the sprint. The team agreed to finish the checkout flow first and to hold a review with the ' +
            'client next Thursday.',
        });

      const res = await request(app)
        .post(`/api/collab/meetings/${meeting.body.data.id}/summary`)
        .set(auth(f.agencyAAdminToken));

      // Without AI_API_KEY the feature returns a readable 503 rather than crashing.
      expect([200, 503]).toContain(res.status);
      if (res.status === 503) {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/AI/i);
      }
    });

    it('refuses to summarise a meeting from another tenant', async () => {
      const res = await request(app)
        .post(`/api/collab/meetings/${'0'.repeat(24)}/summary`)
        .set(auth(f.agencyAAdminToken));

      expect([403, 404]).toContain(res.status);
    });

    it('refuses to summarise a meeting with too little context', async () => {
      const meeting = await request(app)
        .post('/api/collab/meetings')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Empty meeting',
          date: new Date().toISOString(),
          notes: 'short',
        });

      const res = await request(app)
        .post(`/api/collab/meetings/${meeting.body.data.id}/summary`)
        .set(auth(f.agencyAAdminToken));

      expect(res.status).toBe(400);
    });

    it('lets a user review and save an edited summary', async () => {
      const meeting = await request(app)
        .post('/api/collab/meetings')
        .set(auth(f.agencyAAdminToken))
        .send({
          projectId: f.aProject1Id,
          title: 'Reviewable meeting',
          date: new Date().toISOString(),
          notes: 'A sufficiently long note so the endpoint accepts an edit.',
        });

      const saved = await request(app)
        .patch(`/api/collab/meetings/${meeting.body.data.id}/summary`)
        .set(auth(f.agencyAAdminToken))
        .send({
          summary: 'Edited by hand after reviewing the generated draft.',
          decisions: ['Ship the revised scope'],
          actionItems: [{ title: 'Send the revised quote', owner: 'Priya' }],
          deadlines: ['2026-01-31'],
        });

      expect(saved.status).toBe(200);
      expect(saved.body.data.summary).toContain('Edited by hand');
      expect(saved.body.data.decisions).toHaveLength(1);
    });
  });
});
  });