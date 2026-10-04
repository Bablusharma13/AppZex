import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost } from '@/lib/api-client';
import type { PageMeta } from '@/services/auth.service';
import type {
  AiSummaryResult,
  ConvertedTasksResult,
  CreateMeetingInput,
  FeedbackDto,
  FeedbackListQuery,
  MeetingDto,
  MeetingListQuery,
} from '@/types/api';
import type { FeedbackStatus } from '@/types/enums';

type Page<T> = PageMeta & { items: T[] };

/**
 * Meetings, feedback and the AI workflow.
 *
 * Like every other service, none of these methods accepts an `agencyId`: the
 * tenant comes from the session. The AI workflow in particular is only reachable
 * after the meeting has been loaded with a tenant filter, so cross-tenant notes
 * cannot reach the model.
 */
export const collabService = {
  // ------------------------------------------------------------- meetings ----
  listMeetings: (query: MeetingListQuery = {}, signal?: AbortSignal): Promise<Page<MeetingDto>> =>
    apiGetPaginated<MeetingDto>('/collab/meetings', { query, signal }),

  getMeeting: (id: string) => apiGet<MeetingDto>(`/collab/meetings/${id}`),

  createMeeting: (input: CreateMeetingInput): Promise<MeetingDto> =>
    apiPost<MeetingDto>('/collab/meetings', { body: input }),

  updateMeeting: (id: string, updates: Partial<CreateMeetingInput>): Promise<MeetingDto> =>
    apiPatch<MeetingDto>(`/collab/meetings/${id}`, { body: updates }),

  deleteMeeting: (id: string): Promise<{ message: string }> =>
    apiDelete<{ message: string }>(`/collab/meetings/${id}`),

  // ------------------------------------------------------------- feedback ----
  listFeedback: (query: FeedbackListQuery = {}, signal?: AbortSignal): Promise<Page<FeedbackDto>> =>
    apiGetPaginated<FeedbackDto>('/collab/feedback', { query, signal }),

  getFeedback: (id: string) => apiGet<FeedbackDto>(`/collab/feedback/${id}`),

  /** Agency side: change status and optionally answer the client. */
  updateFeedbackStatus: (
    id: string,
    status: FeedbackStatus,
    agencyResponse?: string,
  ): Promise<FeedbackDto> =>
    apiPatch<FeedbackDto>(`/collab/feedback/${id}/status`, { body: { status, agencyResponse } }),

  replyToFeedback: (id: string, body: string): Promise<FeedbackDto> =>
    apiPost<FeedbackDto>(`/collab/feedback/${id}/replies`, { body: { body } }),
};

/**
 * AI meeting summary.
 *
 * Returns a 503 with a readable message when the provider is unconfigured or
 * unreachable, so the rest of the meeting workflow keeps working unchanged.
 */
export const aiService = {
  generateSummary: (meetingId: string): Promise<AiSummaryResult> =>
    apiPost<AiSummaryResult>(`/collab/meetings/${meetingId}/summary`, { body: {} }),

  saveSummary: (
    meetingId: string,
    payload: {
      summary: string;
      decisions: string[];
      actionItems: { title: string; owner?: string; dueDate?: string }[];
      deadlines: string[];
    },
  ) => apiPatch<MeetingDto['aiSummary']>(`/collab/meetings/${meetingId}/summary`, { body: payload }),

  /** Converts selected AI action items into real tasks on the meeting's project. */
  convertActionItemsToTasks: (
    meetingId: string,
    actionItems: {
      title: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      milestoneId?: string | null;
    }[],
  ): Promise<ConvertedTasksResult> =>
    apiPost<ConvertedTasksResult>(`/collab/meetings/${meetingId}/summary/tasks`, {
      body: { actionItems },
    }),
};