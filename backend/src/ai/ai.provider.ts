import { env } from '../config/env';

export interface AiSummaryResult {
  summary: string;
  decisions: string[];
  actionItems: { title: string; owner?: string; dueDate?: string }[];
  deadlines: string[];
  model: string;
}

/**
 * Raised when the AI provider is unconfigured, unreachable or unusable.
 * Callers translate this into a 503 with a friendly message so the rest of the
 * application keeps working.
 */
export class AiUnavailableError extends Error {
  public readonly code = 'AI_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateSummaryInput {
  meetingTitle: string;
  meetingDate: Date;
  notes: string;
  projectName: string;
  clientName: string;
  milestones: string[];
  openActionItems: string[];
}

const SYSTEM_PROMPT = `You are a project delivery assistant for a software agency.
You read the notes of a project meeting and produce a structured summary.

Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "summary": "3-5 sentence neutral summary of what was discussed",
  "decisions": ["each decision agreed in the meeting"],
  "actionItems": [{ "title": "imperative task description", "owner": "name or role or empty string", "dueDate": "YYYY-MM-DD or empty string" }],
  "deadlines": ["any dated commitments mentioned, as short strings"]
}

Rules:
- Use only information present in the meeting notes. Never invent facts, names or dates.
- If no decisions were made, return an empty array.
- If no action items were identified, return an empty array.
- dueDate must be a real date inferable from the notes; otherwise use an empty string.`;

export function isAiConfigured(): boolean {
  return Boolean(env.AI_API_KEY && env.AI_API_KEY.trim().length > 0);
}

/** Extracts the first balanced JSON object from a model response. */
function parseJsonPayload(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const asStringArray = (value: unknown, max = 30): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
};

/**
 * Calls an OpenAI-compatible chat completions endpoint.
 *
 * Only data the caller is already authorised to see is passed in. Tenant
 * isolation is enforced *before* this function is reached (the meeting is
 * loaded with an `agencyId` filter in `meeting.service.ts`), so another
 * tenant's data can never reach the prompt.
 */
export async function generateMeetingSummary(input: GenerateSummaryInput): Promise<AiSummaryResult> {
  if (!isAiConfigured()) {
    throw new AiUnavailableError(
      'AI service is not configured. Set AI_API_KEY in the environment to enable meeting summaries.',
    );
  }

  const context = [
    `Project: ${input.projectName}`,
    `Client: ${input.clientName}`,
    `Meeting: ${input.meetingTitle}`,
    `Date: ${input.meetingDate.toISOString().slice(0, 10)}`,
    input.milestones.length ? `Project milestones: ${input.milestones.join(', ')}` : '',
    input.openActionItems.length ? `Currently open action items: ${input.openActionItems.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${context}\n\n--- MEETING NOTES ---\n${input.notes}\n--- END NOTES ---\n\nRespond with JSON only.`,
    },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The key is read from the environment only; never logged or returned.
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new AiUnavailableError('The AI service took too long to respond. Please try again.');
    }
    throw new AiUnavailableError('Could not reach the AI service. Please try again later.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Log the status only: the provider body can echo the prompt or the key.
    throw new AiUnavailableError(
      response.status === 401 || response.status === 403
        ? 'The AI service rejected the configured credentials.'
        : `The AI service returned an error (status ${response.status}).`,
    );
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new AiUnavailableError('The AI service returned an empty response.');

  const payload = parseJsonPayload(content);
  if (!payload) throw new AiUnavailableError('The AI service returned an unreadable response. Please try again.');

  const rawActions = Array.isArray(payload.actionItems) ? payload.actionItems : [];
  const actionItems = rawActions
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => ({
      title: typeof a.title === 'string' ? a.title.trim().slice(0, 300) : '',
      owner: typeof a.owner === 'string' ? a.owner.trim().slice(0, 120) : undefined,
      dueDate: typeof a.dueDate === 'string' ? a.dueDate.trim().slice(0, 60) : undefined,
    }))
    .filter((a) => a.title.length > 0)
    .slice(0, 30);

  return {
    summary: typeof payload.summary === 'string' ? payload.summary.trim().slice(0, 8000) : '',
    decisions: asStringArray(payload.decisions),
    actionItems,
    deadlines: asStringArray(payload.deadlines),
    model: env.AI_MODEL,
  };
}