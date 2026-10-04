'use client';

import type { ComponentType, ReactNode } from 'react';
import { Calendar, CheckCircle2, Clock, FileText, MessageSquare } from 'lucide-react';

import {
  FeedbackStatusBadge,
  MilestoneStatusBadge,
  VisibilityBadge,
} from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FeedbackDto, FileDto, MeetingDto, MilestoneDto } from '@/types/api';
import { formatBytes, formatDate, formatDateTime } from '@/utils/format';

/** Shared empty placeholder so every section reads the same way. */
function Empty({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="px-1 py-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/** Loading placeholder for a section body. */
function Loading(): JSX.Element {
  return (
    <div className="space-y-2 py-2" role="status" aria-label="Loading">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

export function ProgressStat({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}): JSX.Element {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Milestones on the project. Clients see these read-only. */
export function MilestoneList({
  milestones,
  isLoading,
}: {
  milestones: MilestoneDto[];
  isLoading: boolean;
}): JSX.Element {
  if (isLoading) return <Loading />;
  if (milestones.length === 0) {
    return (
      <Empty title="No milestones" description="Your agency has not published milestones yet." />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {milestones.map((milestone) => (
        <li key={milestone.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{milestone.name}</p>
            {milestone.dueDate ? (
              <p className="text-xs text-muted-foreground">Due {formatDate(milestone.dueDate)}</p>
            ) : null}
          </div>
          <MilestoneStatusBadge status={milestone.status} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Client-visible meetings.
 *
 * The API only returns CLIENT_VISIBLE meetings to a client account, and
 * `internalNotes` is stripped server-side before serialisation.
 */
export function MeetingList({
  meetings,
  isLoading,
}: {
  meetings: MeetingDto[];
  isLoading: boolean;
}): JSX.Element {
  if (isLoading) return <Loading />;
  if (meetings.length === 0) {
    return <Empty title="No meetings shared" description="Shared meetings will appear here." />;
  }

  return (
    <ul className="divide-y divide-border">
      {meetings.map((meeting) => (
        <li key={meeting.id} className="py-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium">{meeting.title}</p>
            <VisibilityBadge visibility={meeting.visibility} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateTime(meeting.date)}
          </p>
          {meeting.notes ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
              {meeting.notes}
            </p>
          ) : null}
          {meeting.aiSummary ? (
            <div className="mt-2 rounded-md border border-border bg-muted/40 p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                AI summary
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{meeting.aiSummary.summary}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Feedback the client has raised on this project, plus agency replies. */
export function FeedbackList({
  items,
  isLoading,
  action,
}: {
  items: FeedbackDto[];
  isLoading: boolean;
  action?: ReactNode;
}): JSX.Element {
  if (isLoading) return <Loading />;
  if (items.length === 0) {
    return (
      <Empty
        title="No feedback yet"
        description="Raise a change request or report an issue to get your agency on it."
      />
    );
  }

  return (
    <div className="space-y-3">
      {action}
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <FeedbackStatusBadge status={item.status} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {item.category.replace(/_/g, ' ').toLowerCase()} · {formatDate(item.createdAt)}
            </p>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.description}</p>
            {item.agencyResponse ? (
              <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 p-2.5">
                <p className="text-xs font-medium text-sky-900">Response from your agency</p>
                <p className="mt-1 whitespace-pre-line text-xs text-sky-900">
                  {item.agencyResponse}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shared files on the project.
 *
 * Downloads go through `fileService`, which attaches the bearer token. The
 * backend re-checks tenant, ownership and visibility before streaming a byte.
 */
export function FileList({
  files,
  isLoading,
  onDownload,
}: {
  files: FileDto[];
  isLoading: boolean;
  onDownload?: (file: FileDto) => void;
}): JSX.Element {
  if (isLoading) return <Loading />;
  if (files.length === 0) {
    return <Empty title="No shared files" description="Files your agency shares will appear here." />;
  }

  return (
    <ul className="divide-y divide-border">
      {files.map((file) => (
        <li key={file.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.originalName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)} · {file.uploadedByName} · {formatDate(file.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onDownload ? (
              <Button variant="outline" size="sm" onClick={() => onDownload(file)}>
                Download
              </Button>
            ) : null}
            <Badge variant="info">Shared</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

export { CheckCircle2, Clock };
