/**
 * Realistic demo dataset used by the seed script.
 *
 * Creates a super admin plus two *separate* tenants (Agency A and Agency B),
 * each with their own clients, projects, milestones, tasks, meetings, feedback
 * and activity. The tenants are populated with deliberately similar content so
 * that tenant isolation can be demonstrated and tested convincingly.
 */
import type { Types } from 'mongoose';
import { hashPassword } from '../utils/crypto';
import { Agency } from '../models/Agency';
import { User } from '../models/User';
import { AgencyMember } from '../models/AgencyMember';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { Milestone } from '../models/Milestone';
import { Task } from '../models/Task';
import { Meeting } from '../models/Meeting';
import { Feedback } from '../models/Feedback';
import { ActivityLog } from '../models/ActivityLog';
import { SupportSession } from '../models/SupportSession';
import {
  AGENCY_STATUS, EVENT_TYPES, FEEDBACK_STATUS, MILESTONE_STATUS, PLANS,
  PRIORITIES, PROJECT_STATUS, ROLES, TASK_STATUS, VISIBILITY,
} from '../types/enums';

export const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
export const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export interface SeedRefs {
  agencies: Map<string, Types.ObjectId>;
  users: Map<string, Types.ObjectId>;
  clients: Map<string, Types.ObjectId>;
  projects: Map<string, Types.ObjectId>;
  milestones: Map<string, Types.ObjectId>;
}

/** Password for every demo account. Documented; hashed before storage. */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'AgencyDemo123!';

export async function wipeAll(): Promise<void> {
  await Promise.all([
    ActivityLog.deleteMany({}).exec(),
    SupportSession.deleteMany({}).exec(),
    Feedback.deleteMany({}).exec(),
    Meeting.deleteMany({}).exec(),
    Task.deleteMany({}).exec(),
    Milestone.deleteMany({}).exec(),
    Project.deleteMany({}).exec(),
    AgencyMember.deleteMany({}).exec(),
    User.deleteMany({}).exec(),
    Client.deleteMany({}).exec(),
    Agency.deleteMany({}).exec(),
  ]);
}

interface ClientSpec {
  key: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  notes?: string;
}

interface StaffSpec {
  key: string;
  name: string;
  email: string;
  role: string;
  jobTitle?: string;
  /** Only for CLIENT logins: which client company record they belong to. */
  clientKey?: string;
}

interface ProjectSpec {
  key: string;
  name: string;
  clientKey: string;
  status: string;
  priority: string;
  startInDays: number;
  dueInDays: number;
  managerKey?: string;
  description?: string;
}

export async function seedPlatform(refs: SeedRefs): Promise<Types.ObjectId> {
  // The Super Admin is the one account that does NOT get the shared demo
  // password: honour SUPER_ADMIN_PASSWORD when it is supplied, so a real
  // deployment can seed its platform operator without ever shipping a
  // well-known credential. Falls back to the demo password for local use.
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || DEMO_PASSWORD;
  const passwordHash = await hashPassword(superAdminPassword);

  const superAdmin = await User.create({
    name: 'AppZex Platform Admin',
    email: process.env.SUPER_ADMIN_EMAIL ?? 'admin@appzex-demo.com',
    passwordHash,
    role: ROLES.SUPER_ADMIN,
    agencyId: null,
    clientId: null,
    isActive: true,
    jobTitle: 'Platform Administrator',
  });

  await seedTenant(
    refs,
    {
      name: 'Northstar Digital',
      ownerName: 'Priya Sharma',
      email: 'hello@northstardigital.com',
      phone: '+1 415 555 0101',
      plan: PLANS.PROFESSIONAL,
      address: '221 Market Street, San Francisco, CA',
      website: 'https://northstardigital.example.com',
    },
    [
      { key: 'aAdmin', name: 'Priya Sharma', email: 'agency-a-admin@appzex-demo.com', role: ROLES.AGENCY_ADMIN, jobTitle: 'Founder & Managing Director' },
      { key: 'aTeam', name: 'Daniel Okafor', email: 'agency-a-team@appzex-demo.com', role: ROLES.AGENCY_TEAM, jobTitle: 'Senior Developer' },
      { key: 'aTeam2', name: 'Sofia Marino', email: 'sofia.marino@northstardigital.example.com', role: ROLES.AGENCY_TEAM, jobTitle: 'Project Manager' },
    ],
    [
      { key: 'aClient1', name: 'Elena Vasquez', email: 'agency-a-client@appzex-demo.com', role: ROLES.CLIENT, jobTitle: 'Marketing Director', clientKey: 'aClient1' },
      { key: 'aClient2', name: 'Dr. Amina Yusuf', email: 'amina.yusuf@harborhealth.example.com', role: ROLES.CLIENT, jobTitle: 'Operations Lead', clientKey: 'aClient2' },
    ],
    [
      {
        key: 'aClient1', companyName: 'Lumina Retail Group', contactPerson: 'Elena Vasquez',
        email: 'elena@luminaretail.example.com', phone: '+1 415 555 0202',
        notes: 'Key retail account. Prefers a written status update every Friday.',
      },
      {
        key: 'aClient2', companyName: 'Harbor Health Systems', contactPerson: 'Dr. Amina Yusuf',
        email: 'a.yusuf@harborhealth.example.com', phone: '+1 415 555 0303',
        notes: 'Healthcare project. All documents are handled under strict access control.',
      },
    ],
    [
      {
        key: 'aP1', name: 'Lumina Storefront Replatform', clientKey: 'aClient1',
        status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.HIGH,
        startInDays: -45, dueInDays: 30, managerKey: 'aAdmin',
        description: 'Migrate the legacy storefront to a headless architecture with a new checkout flow.',
      },
      {
        key: 'aP2', name: 'Harbor Patient Portal', clientKey: 'aClient2',
        status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.URGENT,
        startInDays: -20, dueInDays: 12, managerKey: 'aTeam',
        description: 'Secure patient-facing portal for appointment booking and records.',
      },
      {
        key: 'aP3', name: 'Lumina Loyalty App', clientKey: 'aClient1',
        status: PROJECT_STATUS.ON_HOLD, priority: PRIORITIES.MEDIUM,
        startInDays: -90, dueInDays: 60, managerKey: 'aTeam2',
        description: 'Paused pending the loyalty vendor contract.',
      },
      {
        key: 'aP4', name: 'Harbor Internal Reporting', clientKey: 'aClient2',
        status: PROJECT_STATUS.COMPLETED, priority: PRIORITIES.MEDIUM,
        startInDays: -150, dueInDays: -30, managerKey: 'aAdmin',
        description: 'Delivered internal BI dashboard.',
      },
    ],
    passwordHash,
  );

  await seedTenant(
    refs,
    {
      name: 'Bluepeak Creative',
      ownerName: 'Marcus Reid',
      email: 'contact@bluepeakcreative.example.com',
      phone: '+1 212 555 0404',
      plan: PLANS.STARTER,
      address: '45 Madison Avenue, New York, NY',
      website: 'https://bluepeakcreative.example.com',
    },
    [{ key: 'bAdmin', name: 'Marcus Reid', email: 'agency-b-admin@appzex-demo.com', role: ROLES.AGENCY_ADMIN, jobTitle: 'Creative Director' }],
    [
      { key: 'bClient1', name: 'Nina Patel', email: 'agency-b-client@appzex-demo.com', role: ROLES.CLIENT, jobTitle: 'Operations Lead', clientKey: 'bClient1' },
      { key: 'bClient2', name: 'Owen Blake', email: 'owen.blake@vertexstudios.example.com', role: ROLES.CLIENT, jobTitle: 'Founder', clientKey: 'bClient2' },
    ],
    [
      {
        key: 'bClient1', companyName: 'Cascade Foods Co.', contactPerson: 'Nina Patel',
        email: 'nina@cascadefoods.example.com', phone: '+1 212 555 0505',
        notes: 'E-commerce refresh with an aggressive Q4 timeline.',
      },
      {
        key: 'bClient2', companyName: 'Vertex Studios', contactPerson: 'Owen Blake',
        email: 'owen@vertexstudios.example.com', phone: '+1 212 555 0606',
        notes: 'Branding package only.',
      },
    ],
    [
      {
        key: 'bP1', name: 'Cascade E-commerce Refresh', clientKey: 'bClient1',
        status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.HIGH,
        startInDays: -30, dueInDays: 25, managerKey: 'bAdmin',
        description: 'Rebuild the Cascade Foods online store ahead of Q4.',
      },
      {
        key: 'bP2', name: 'Vertex Brand Guidelines', clientKey: 'bClient2',
        status: PROJECT_STATUS.ACTIVE, priority: PRIORITIES.LOW,
        startInDays: -10, dueInDays: 40, managerKey: 'bAdmin',
        description: 'Document the refreshed Vertex Studios brand system.',
      },
    ],
    passwordHash,
  );

  return superAdmin._id;
}

/**
 * Creates one tenant: agency -> clients -> users (staff + client logins) ->
 * projects. Every child document receives the tenant's `agencyId` explicitly.
 */
async function seedTenant(
  refs: SeedRefs,
  agencySpec: {
    name: string; ownerName: string; email: string; phone?: string;
    plan: string; address?: string; website?: string;
  },
  staffSpecs: StaffSpec[],
  clientUserSpecs: StaffSpec[],
  clientSpecs: ClientSpec[],
  projectSpecs: ProjectSpec[],
  passwordHash: string,
): Promise<void> {
  const agency = await Agency.create({
    name: agencySpec.name,
    ownerName: agencySpec.ownerName,
    email: agencySpec.email,
    phone: agencySpec.phone,
    plan: agencySpec.plan as never,
    status: AGENCY_STATUS.ACTIVE,
    address: agencySpec.address,
    website: agencySpec.website,
  });

  const agencyKey = agencySpec.name.startsWith('Northstar') ? 'a' : 'b';
  refs.agencies.set(agencyKey, agency._id);

  for (const spec of clientSpecs) {
    const client = await Client.create({
      agencyId: agency._id,
      companyName: spec.companyName,
      contactPerson: spec.contactPerson,
      email: spec.email,
      phone: spec.phone,
      notes: spec.notes,
      isActive: true,
    });
    refs.clients.set(spec.key, client._id);
  }

  for (const spec of staffSpecs) {
    const user = await User.create({
      name: spec.name,
      email: spec.email,
      passwordHash,
      role: spec.role as never,
      agencyId: agency._id,
      clientId: null,
      jobTitle: spec.jobTitle,
      isActive: true,
    });
    refs.users.set(spec.key, user._id);

    await AgencyMember.create({
      agencyId: agency._id,
      userId: user._id,
      role: spec.role as never,
      jobTitle: spec.jobTitle,
      joinedAt: daysAgo(120),
    });
  }

  // Client logins are created after clients exist so `clientId` is resolvable.
  for (const spec of clientUserSpecs) {
    const clientId = refs.clients.get(spec.clientKey ?? '');
    if (!clientId) {
      throw new Error(`Seed configuration error: no client record for "${spec.key}"`);
    }

    const user = await User.create({
      name: spec.name,
      email: spec.email,
      passwordHash,
      role: ROLES.CLIENT,
      agencyId: agency._id,
      clientId,
      jobTitle: spec.jobTitle,
      isActive: true,
    });
    refs.users.set(spec.key, user._id);
  }

  for (const spec of projectSpecs) {
    const project = await Project.create({
      agencyId: agency._id,
      clientId: refs.clients.get(spec.clientKey),
      name: spec.name,
      description: spec.description,
      status: spec.status as never,
      priority: spec.priority as never,
      startDate: daysFromNow(spec.startInDays),
      expectedCompletionDate: daysFromNow(spec.dueInDays),
      projectManagerId: spec.managerKey ? refs.users.get(spec.managerKey) : null,
    });
    refs.projects.set(spec.key, project._id);
  }
}

/**
 * Seeds milestones and tasks for both tenants.
 *
 * Every document receives the caller's `agencyId`, mirroring the shape the API
 * actually produces, so derived project progress is non-trivial from the start.
 */
export async function seedWork(refs: SeedRefs): Promise<void> {
  const plans: { agencyKey: string; projects: string[]; staff: string[] }[] = [
    { agencyKey: 'a', projects: ['aP1', 'aP2', 'aP3'], staff: ['aAdmin', 'aTeam', 'aTeam2'] },
    { agencyKey: 'b', projects: ['bP1', 'bP2'], staff: ['bAdmin'] },
  ];

  for (const plan of plans) {
    const agencyId = refs.agencies.get(plan.agencyKey);
    if (!agencyId) continue;

    for (const projectKey of plan.projects) {
      const projectId = refs.projects.get(projectKey);
      if (!projectId) continue;

      const phases = ['Planning', 'Design', 'Development', 'Testing', 'Client Review', 'Launch'];

      const milestones = await Milestone.create(
        phases.map((name, index) => ({
          agencyId,
          projectId,
          name,
          description: `${name} phase.`,
          status:
            index === 0
              ? MILESTONE_STATUS.COMPLETED
              : index === 1
                ? MILESTONE_STATUS.IN_PROGRESS
                : MILESTONE_STATUS.PENDING,
          order: index,
          dueDate: daysFromNow((index - 1) * 12),
          completedAt: index === 0 ? daysAgo(20) : undefined,
        })),
      );

      milestones.forEach((m, index) => refs.milestones.set(`${projectKey}-m${index}`, m._id));

      const titles = [
        'Gather stakeholder requirements',
        'Produce wireframes for the main flows',
        'Implement the authentication module',
        'Build the reporting dashboard',
        'Write integration tests',
        'Run the accessibility audit',
        'Prepare the client handover document',
        'Deploy to the staging environment',
      ];
      const statuses = [
        TASK_STATUS.DONE, TASK_STATUS.DONE, TASK_STATUS.DONE, TASK_STATUS.IN_PROGRESS,
        TASK_STATUS.TODO, TASK_STATUS.REVIEW, TASK_STATUS.TODO, TASK_STATUS.TODO,
      ];

      await Task.create(
        titles.map((title, index) => ({
          agencyId,
          projectId,
          milestoneId: milestones[index % 3]._id,
          title,
          description: `${title} - part of the ${phases[index % phases.length]} phase.`,
          assigneeId: refs.users.get(plan.staff[index % plan.staff.length]) ?? null,
          createdBy: refs.users.get(plan.staff[0]) ?? null,
          status: statuses[index] as never,
          priority: (index % 4 === 0 ? PRIORITIES.HIGH : PRIORITIES.MEDIUM) as never,
          // Index 5 is deliberately overdue so the overdue indicator is visible.
          dueDate: index === 5 ? daysAgo(3) : daysFromNow(index * 3 - 2),
          completedAt: statuses[index] === TASK_STATUS.DONE ? daysAgo(5) : undefined,
          comments: [],
        })),
      );
    }
  }
}

/** Seeds meetings, client feedback and activity entries. */
export async function seedCommunications(refs: SeedRefs): Promise<void> {
  const plans: { agencyKey: string; projects: string[]; staff: string[]; clientUser: string }[] = [
    { agencyKey: 'a', projects: ['aP1', 'aP2', 'aP3'], staff: ['aAdmin', 'aTeam'], clientUser: 'aClient1' },
    { agencyKey: 'b', projects: ['bP1', 'bP2'], staff: ['bAdmin'], clientUser: 'bClient1' },
  ];

  for (const plan of plans) {
    const agencyId = refs.agencies.get(plan.agencyKey);
    if (!agencyId) continue;

    for (const projectKey of plan.projects) {
      const projectId = refs.projects.get(projectKey);
      if (!projectId) continue;

      const staffId = refs.users.get(plan.staff[0]) ?? null;

      await Meeting.create([
        {
          agencyId,
          projectId,
          title: 'Project kickoff',
          date: daysAgo(20),
          durationMinutes: 60,
          agenda: 'Align on scope, timeline and responsibilities.',
          notes:
            'The team walked through the scope with the client. Key outcomes: the checkout flow is the highest priority, ' +
            'and the client needs a written status update every Friday. Design will start next week and the first ' +
            'milestone review is planned for the end of the month.',
          internalNotes: 'Budget has room for one additional contractor if needed.',
          visibility: VISIBILITY.CLIENT_VISIBLE,
          attendees: ['Project Manager', 'Lead Developer', 'Client Stakeholder'],
          createdBy: staffId,
        },
        {
          agencyId,
          projectId,
          title: 'Internal sprint planning',
          date: daysAgo(6),
          durationMinutes: 45,
          agenda: 'Sprint planning for the current iteration.',
          notes:
            'Sprint planning for the current iteration. The team agreed to finish the authentication module before ' +
            'moving to reporting, and the accessibility audit will be raised by Friday. No client decisions were needed.',
          internalNotes: 'Risk: the reporting dataset is not available yet - awaiting the client data team.',
          visibility: VISIBILITY.INTERNAL,
          attendees: ['Senior Developer', 'Project Manager'],
          createdBy: staffId,
        },
      ]);

      const project = await Project.findById(projectId).select('clientId').lean().exec();
      const clientUserId = refs.users.get(plan.clientUser);
      if (project && clientUserId) {
        await Feedback.create([
          {
            agencyId,
            projectId,
            clientId: project.clientId,
            submittedBy: clientUserId,
            submittedByName: 'Client Stakeholder',
            title: 'Checkout page needs clearer error messaging',
            description:
              'When a payment is declined the page shows a generic error. Please surface the specific reason and offer ' +
              'a retry option. This is blocking our launch readiness review.',
            category: 'CHANGE_REQUEST',
            status: FEEDBACK_STATUS.IN_PROGRESS,
            agencyResponse: 'Agreed. This is in the current sprint and a review build will be shared.',
            respondedBy: staffId,
            respondedAt: daysAgo(3),
            replies: [],
          },
          {
            agencyId,
            projectId,
            clientId: project.clientId,
            submittedBy: clientUserId,
            submittedByName: 'Client Stakeholder',
            title: 'Homepage hero image is not loading on mobile',
            description: 'The hero image does not render in iOS Safari at mobile widths.',
            category: 'BUG',
            status: FEEDBACK_STATUS.OPEN,
            replies: [],
          },
        ]);
      }

      // Project lifecycle entries so the activity feed is not empty.
      await ActivityLog.create([
        {
          agencyId,
          actorId: staffId,
          actorName: plan.agencyKey === 'a' ? 'Priya Sharma' : 'Marcus Reid',
          eventType: EVENT_TYPES.PROJECT_CREATED,
          relatedEntityType: 'PROJECT',
          relatedEntityId: projectId,
          visibility: VISIBILITY.CLIENT_VISIBLE,
          metadata: { seeded: true },
          createdAt: daysAgo(45),
          updatedAt: daysAgo(45),
        },
      ]);
    }
  }
}