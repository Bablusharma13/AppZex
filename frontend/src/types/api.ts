/**
 * API response DTOs.
 *
 * These mirror the DTOs the backend services return. `passwordHash` is never
 * part of any of these shapes - the backend strips it before serialising.
 */

import type {
  AgencyStatus,
  FeedbackCategory,
  FeedbackStatus,
  FileEntityType,
  MilestoneStatus,
  Plan,
  Priority,
  ProjectStatus,
  Role,
  SupportScope,
  TaskStatus,
  Visibility,
} from './enums';

/** Success envelope returned by every endpoint. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Paginated envelope. */
export interface ApiPaginated<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/** Error envelope returned by the centralised error handler. */
export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  errors?: { field: string; message: string }[];
  requestId?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  agencyId: string | null;
  clientId: string | null;
  jobTitle?: string;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface LoginResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number | string;
  refreshTokenId: string;
}

export interface ProgressStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  reviewTasks: number;
  progressPercentage: number;
  overdueTasks: number;
}

export interface ClientDto {
  id: string;
  agencyId: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  notes?: string;
  address?: string;
  isActive: boolean;
  projectCount?: number;
  userCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDto {
  id: string;
  agencyId: string;
  clientId: string;
  client?: { id: string; companyName: string };
  projectManager?: { id: string; name: string; email: string } | null;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: string;
  expectedCompletionDate?: string;
  projectManagerId: string | null;
  budget?: number;
  /** Always derived server-side from the task collection. Never typed by a user. */
  progress: ProgressStats;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCommentDto {
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TaskDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  milestoneId: string | null;
  milestone?: { id: string; name: string } | null;
  title: string;
  description?: string;
  assigneeId: string | null;
  assignee?: { id: string; name: string } | null;
  createdBy: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: string;
  completedAt?: string;
  isOverdue: boolean;
  comments: TaskCommentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  name: string;
  description?: string;
  status: MilestoneStatus;
  dueDate?: string;
  order: number;
  completedAt?: string;
  taskCount?: number;
  completedTaskCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiSummary {
  summary: string;
  decisions: string[];
  actionItems: { title: string; owner?: string; dueDate?: string }[];
  deadlines: string[];
  generatedAt: string;
  model: string;
}

export interface MeetingDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  title: string;
  date: string;
  durationMinutes?: number;
  notes?: string;
  agenda?: string;
  /** Never returned to client accounts. */
  internalNotes?: string;
  visibility: Visibility;
  attendees: string[];
  aiSummary: AiSummary | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackReplyDto {
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface FeedbackDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  clientId: string;
  client?: { id: string; companyName: string };
  submittedBy: string;
  submittedByName: string;
  title: string;
  description: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  agencyResponse?: string;
  respondedAt?: string;
  replies: FeedbackReplyDto[];
  createdAt: string;
  updatedAt: string;
}

export interface FileDto {
  id: string;
  agencyId: string;
  relatedEntityType: FileEntityType;
  relatedEntityId: string;
  projectId?: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  visibility: Visibility;
  createdAt: string;
}

export interface ActivityLogDto {
  id: string;
  agencyId: string;
  actorId: string | null;
  actorName: string;
  actorType: 'USER' | 'SYSTEM';
  eventType: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  visibility: Visibility;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TeamMemberDto extends PublicUser {
  assignedProjectCount: number;
}

export interface AgencySummary {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone?: string;
  status: AgencyStatus;
  plan: Plan;
  address?: string;
  website?: string;
  suspensionReason?: string;
  suspendedAt?: string;
  userCount: number;
  clientCount: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformMetrics {
  totalAgencies: number;
  activeAgencies: number;
  suspendedAgencies: number;
  inactiveAgencies: number;
  totalUsers: number;
  totalClientCompanies: number;
  totalProjects: number;
  totalTasks: number;
  agenciesByPlan: Record<string, number>;
  recentActivity: ActivityLogDto[];
}

export interface AgencyDashboard {
  totalClients: number;
  activeProjects: number;
  projectsDueSoon: number;
  completedProjects: number;
  totalProjects: number;
  onHoldProjects: number;
  pendingFeedback: number;
  overdueTasks: number;
  openTasks: number;
  totalTasks: number;
  upcomingDeadlines: {
    tasks: {
      id: string;
      title: string;
      dueDate: string;
      projectName: string;
      assigneeName?: string;
    }[];
    milestones: { id: string; name: string; dueDate: string; projectName: string }[];
    projects: { id: string; name: string; expectedCompletionDate: string }[];
  };
  projectStatusDistribution: Record<ProjectStatus, number>;
  taskStatusDistribution: Record<TaskStatus, number>;
  feedbackStatusDistribution: Record<FeedbackStatus, number>;
  recentActivity: ActivityLogDto[];
}

export interface ClientDashboard {
  companyName: string;
  activeProjects: number;
  completedProjects: number;
  pendingActions: number;
  openFeedback: number;
  clientVisibleMeetings: number;
  sharedFiles: number;
  upcomingDeadlines: { id: string; name: string; expectedCompletionDate: string }[];
  recentActivity: ActivityLogDto[];
}

export interface SupportSessionDto {
  sessionId: string;
  agencyId: string;
  agencyName: string;
  agencyStatus: string;
  superAdminId: string;
  superAdminName: string;
  scope: SupportScope;
  reason: string;
  expiresAt: string;
  endedAt?: string;
  privilegedActionCount: number;
  createdAt: string;
}

export interface AgencyDetailDto {
  agency: AgencySummary;
  users: {
    _id: string;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    jobTitle?: string;
    lastLoginAt?: string;
    createdAt: string;
  }[];
  clients: {
    _id: string;
    companyName: string;
    contactPerson: string;
    email: string;
    createdAt: string;
  }[];
  projects: {
    _id: string;
    name: string;
    status: ProjectStatus;
    priority: Priority;
    createdAt: string;
    expectedCompletionDate?: string;
  }[];
  feedbackCount: number;
  activity: ActivityLogDto[];
  supportSessions: SupportSessionDto[];
}

export interface AiSummaryResult {
  meetingId: string;
  summary: string;
  decisions: string[];
  actionItems: { title: string; owner?: string; dueDate?: string }[];
  deadlines: string[];
  model: string;
}

/** Generic list query shared by every paginated endpoint. */
export interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProjectListQuery extends ListQuery {
  status?: ProjectStatus;
  priority?: Priority;
  clientId?: string;
  projectManagerId?: string;
  dueWithinDays?: number;
}

export interface TaskListQuery extends ListQuery {
  projectId?: string;
  milestoneId?: string;
  assigneeId?: string;
  status?: TaskStatus;
  priority?: Priority;
  overdue?: boolean;
  dueWithinDays?: number;
}

export interface MilestoneListQuery extends ListQuery {
  projectId?: string;
  status?: MilestoneStatus;
}

export interface MeetingListQuery extends ListQuery {
  projectId?: string;
  visibility?: Visibility;
  from?: string;
  to?: string;
}

export interface FeedbackListQuery extends ListQuery {
  projectId?: string;
  status?: FeedbackStatus;
  category?: FeedbackCategory;
}

export interface FileListQuery extends ListQuery {
  projectId?: string;
  relatedEntityType?: FileEntityType;
  relatedEntityId?: string;
  /** Staff-only filter; a client account is always pinned to CLIENT_VISIBLE. */
  visibility?: Visibility;
}

export interface ActivityListQuery extends ListQuery {
  eventType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actorId?: string;
  visibility?: Visibility;
  from?: string;
  to?: string;
}

export interface AgencyListQuery extends ListQuery {
  status?: AgencyStatus;
  plan?: Plan;
}

export interface TeamListQuery extends ListQuery {
  role?: Role;
  isActive?: boolean;
}

export interface ClientListQuery extends ListQuery {
  isActive?: boolean;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  clientId: string;
  startDate: string;
  expectedCompletionDate?: string;
  status?: ProjectStatus;
  priority?: Priority;
  projectManagerId?: string;
  budget?: number;
}

export interface CreateTaskInput {
  projectId: string;
  milestoneId?: string | null;
  title: string;
  description?: string;
  assigneeId?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: string | null;
}

export interface CreateMilestoneInput {
  projectId: string;
  name: string;
  description?: string;
  status?: MilestoneStatus;
  dueDate?: string;
  order?: number;
}

export interface CreateMeetingInput {
  projectId: string;
  title: string;
  date: string;
  durationMinutes?: number;
  agenda?: string;
  notes?: string;
  internalNotes?: string;
  visibility?: Visibility;
  attendees?: string[];
}

export interface CreateFeedbackInput {
  projectId: string;
  title: string;
  description: string;
  category?: FeedbackCategory;
}

export interface CreateClientInput {
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  notes?: string;
  address?: string;
}

export interface CreateTeamMemberInput {
  name: string;
  email: string;
  password: string;
  role: 'AGENCY_ADMIN' | 'AGENCY_TEAM';
  jobTitle?: string;
  phone?: string;
}

export interface CreateClientUserInput {
  name: string;
  email: string;
  password: string;
  jobTitle?: string;
}

export interface ConvertedTasksResult {
  created: number;
  tasks: { id: string; title: string }[];
}