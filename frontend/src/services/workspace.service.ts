import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost } from '@/lib/api-client';
import type { PageMeta } from '@/services/auth.service';
import type {
  ActivityListQuery,
  ActivityLogDto,
  AgencyDashboard,
  ClientDashboard,
  ClientDto,
  ClientListQuery,
  CreateClientInput,
  CreateClientUserInput,
  CreateFeedbackInput,
  CreateMilestoneInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateTeamMemberInput,
  FeedbackDto,
  FeedbackListQuery,
  FileDto,
  FileListQuery,
  MeetingDto,
  MeetingListQuery,
  MilestoneDto,
  MilestoneListQuery,
  ProjectDto,
  ProjectListQuery,
  PublicUser,
  TaskDto,
  TaskListQuery,
  TeamListQuery,
  TeamMemberDto,
} from '@/types/api';

/** Combines pagination metadata with the loaded items. */
type Page<T> = PageMeta & { items: T[] };

/**
 * Agency workspace services.
 *
 * Note what is *not* here: there is no `agencyId` parameter anywhere. The tenant
 * is always derived server-side from the authenticated principal, so the client
 * has no way to ask for another agency's data.
 */
export const workspaceService = {
  // ---------------------------------------------------------------- team ----
  listTeam: (query: TeamListQuery = {}, signal?: AbortSignal): Promise<Page<TeamMemberDto>> =>
    apiGetPaginated<TeamMemberDto>('/workspace/team', { query, signal }),

  createTeamMember: (input: CreateTeamMemberInput): Promise<TeamMemberDto> =>
    apiPost<TeamMemberDto>('/workspace/team', { body: input }),

  updateTeamMember: (
    id: string,
    updates: Partial<Omit<CreateTeamMemberInput, 'email' | 'password'>> & { isActive?: boolean },
  ): Promise<TeamMemberDto> => apiPatch<TeamMemberDto>(`/workspace/team/${id}`, { body: updates }),

  // ------------------------------------------------------------- clients ----
  listClients: (query: ClientListQuery = {}, signal?: AbortSignal): Promise<Page<ClientDto>> =>
    apiGetPaginated<ClientDto>('/workspace/clients', { query, signal }),

  getClient: (id: string) => apiGet<ClientDto>(`/workspace/clients/${id}`),

  createClient: (input: CreateClientInput): Promise<ClientDto> =>
    apiPost<ClientDto>('/workspace/clients', { body: input }),

  updateClient: (id: string, updates: Partial<CreateClientInput>): Promise<ClientDto> =>
    apiPatch<ClientDto>(`/workspace/clients/${id}`, { body: updates }),

  deleteClient: (id: string): Promise<{ message: string }> =>
    apiDelete<{ message: string }>(`/workspace/clients/${id}`),

  /** Creates a CLIENT login attached to this agency and company. */
  createClientUser: (clientId: string, input: CreateClientUserInput): Promise<PublicUser> =>
    apiPost<PublicUser>(`/workspace/clients/${clientId}/users`, { body: input }),

  // ------------------------------------------------------------ projects ----
  listProjects: (query: ProjectListQuery = {}, signal?: AbortSignal): Promise<Page<ProjectDto>> =>
    apiGetPaginated<ProjectDto>('/workspace/projects', { query, signal }),

  getProject: (id: string) => apiGet<ProjectDto>(`/workspace/projects/${id}`),

  createProject: (input: CreateProjectInput): Promise<ProjectDto> =>
    apiPost<ProjectDto>('/workspace/projects', { body: input }),

  updateProject: (id: string, updates: Partial<CreateProjectInput>): Promise<ProjectDto> =>
    apiPatch<ProjectDto>(`/workspace/projects/${id}`, { body: updates }),

  deleteProject: (id: string): Promise<{ message: string }> =>
    apiDelete<{ message: string }>(`/workspace/projects/${id}`),

// ------------------------------------------------------------ milestones ---

  listMilestones: (query: MilestoneListQuery = {}, signal?: AbortSignal): Promise<Page<MilestoneDto>> =>
    apiGetPaginated<MilestoneDto>('/workspace/milestones', { query, signal }),

  getMilestone: (id: string) => apiGet<MilestoneDto>(`/workspace/milestones/${id}`),

  createMilestone: (input: CreateMilestoneInput): Promise<MilestoneDto> =>
    apiPost<MilestoneDto>('/workspace/milestones', { body: input }),

  updateMilestone: (id: string, updates: Partial<CreateMilestoneInput>): Promise<MilestoneDto> =>
    apiPatch<MilestoneDto>(`/workspace/milestones/${id}`, { body: updates }),

  deleteMilestone: (id: string): Promise<{ message: string }> =>
    apiDelete<{ message: string }>(`/workspace/milestones/${id}`),

  // --------------------------------------------------------------- tasks ----
  listTasks: (query: TaskListQuery = {}, signal?: AbortSignal): Promise<Page<TaskDto>> =>
    apiGetPaginated<TaskDto>('/collab/tasks', { query, signal }),

  getTask: (id: string) => apiGet<TaskDto>(`/collab/tasks/${id}`),

  createTask: (input: CreateTaskInput): Promise<TaskDto> =>
    apiPost<TaskDto>('/collab/tasks', { body: input }),

  updateTask: (id: string, updates: Partial<CreateTaskInput>): Promise<TaskDto> =>
    apiPatch<TaskDto>(`/collab/tasks/${id}`, { body: updates }),

  deleteTask: (id: string): Promise<{ message: string }> =>
    apiDelete<{ message: string }>(`/collab/tasks/${id}`),

  addTaskComment: (id: string, body: string): Promise<TaskDto> =>
    apiPost<TaskDto>(`/collab/tasks/${id}/comments`, { body: { body } }),

  // ---------------------------------------------------------------- files ----
  listFiles: (query: FileListQuery = {}, signal?: AbortSignal): Promise<Page<FileDto>> =>
    apiGetPaginated<FileDto>('/files', { query, signal }),

  /**
   * Uploads a file against a record in the caller's tenant.
   *
   * `agencyId` is never sent: the server derives it from the session and
   * validates that the parent record exists inside that tenant.
   */
  uploadFile: (
    file: File,
    meta: { relatedEntityType: string; relatedEntityId: string; visibility: string },
  ): Promise<FileDto> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('relatedEntityType', meta.relatedEntityType);
    formData.append('relatedEntityId', meta.relatedEntityId);
    formData.append('visibility', meta.visibility);
    return apiPost<FileDto>('/files', { formData });
  },

  deleteFile: (id: string): Promise<{ message: string }> =>
    apiDelete<{ message: string }>(`/files/${id}`),

  // ------------------------------------------------------------ activity ----
  listActivity: (query: ActivityListQuery = {}, signal?: AbortSignal): Promise<Page<ActivityLogDto>> =>
    apiGetPaginated<ActivityLogDto>('/activity', { query, signal }),

  // ---------------------------------------------------------- dashboards ----
  dashboard: () => apiGet<AgencyDashboard>('/activity/dashboard'),
};

/**
 * Client portal services.
 *
 * These use the dedicated `/collab/client/*` routes. Ownership is enforced by
 * the backend using the caller's own `clientId`, so changing an id in the URL
 * cannot reach another company's records.
 */
export const clientPortalService = {
  dashboard: () => apiGet<ClientDashboard>('/activity/client/dashboard'),

  myCompany: () => apiGet<ClientDto>('/activity/me/client'),

  listProjects: (query: ProjectListQuery = {}, signal?: AbortSignal): Promise<Page<ProjectDto>> =>
    apiGetPaginated<ProjectDto>('/collab/client/projects', { query, signal }),

  getProject: (id: string) => apiGet<ProjectDto>(`/collab/client/projects/${id}`),

  listMilestones: (projectId?: string, signal?: AbortSignal): Promise<Page<MilestoneDto>> =>
    apiGetPaginated<MilestoneDto>('/collab/client/milestones', { query: { projectId }, signal }),

  /** Client meetings. Accepts a full query so the portal can filter and page. */
  listMeetings: (
    query: MeetingListQuery | string = {},
    signal?: AbortSignal,
  ): Promise<Page<MeetingDto>> =>
    apiGetPaginated<MeetingDto>('/collab/client/meetings', {
      query: typeof query === 'string' ? { projectId: query } : query,
      signal,
    }),

  listFiles: (query: FileListQuery = {}, signal?: AbortSignal): Promise<Page<FileDto>> =>
    apiGetPaginated<FileDto>('/files', { query, signal }),

  listFeedback: (query: FeedbackListQuery = {}, signal?: AbortSignal): Promise<Page<FeedbackDto>> =>
    apiGetPaginated<FeedbackDto>('/collab/client/feedback', { query, signal }),

  createFeedback: (input: CreateFeedbackInput) =>
    apiPost<FeedbackDto>('/collab/client/feedback', { body: input }),

  replyToFeedback: (id: string, body: string) =>
    apiPost<FeedbackDto>(`/collab/client/feedback/${id}/replies`, { body: { body } }),
};