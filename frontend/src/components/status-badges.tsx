import { Badge } from '@/components/ui/badge';
import {
  AGENCY_STATUS_LABELS,
  FEEDBACK_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  VISIBILITY_LABELS,
  type AgencyStatus,
  type FeedbackStatus,
  type MilestoneStatus,
  type Priority,
  type ProjectStatus,
  type TaskStatus,
  type Visibility,
} from '@/types/enums';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const PROJECT_VARIANTS: Record<ProjectStatus, BadgeVariant> = {
  ACTIVE: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
};

const TASK_VARIANTS: Record<TaskStatus, BadgeVariant> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  REVIEW: 'warning',
  DONE: 'success',
};

const MILESTONE_VARIANTS: Record<MilestoneStatus, BadgeVariant> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
};

const FEEDBACK_VARIANTS: Record<FeedbackStatus, BadgeVariant> = {
  OPEN: 'danger',
  IN_REVIEW: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  DECLINED: 'neutral',
};

const PRIORITY_VARIANTS: Record<Priority, BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const AGENCY_VARIANTS: Record<AgencyStatus, BadgeVariant> = {
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  INACTIVE: 'neutral',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={PROJECT_VARIANTS[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={TASK_VARIANTS[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return <Badge variant={MILESTONE_VARIANTS[status]}>{MILESTONE_STATUS_LABELS[status]}</Badge>;
}

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <Badge variant={FEEDBACK_VARIANTS[status]}>{FEEDBACK_STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge variant={PRIORITY_VARIANTS[priority]}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function AgencyStatusBadge({ status }: { status: AgencyStatus }) {
  return <Badge variant={AGENCY_VARIANTS[status]}>{AGENCY_STATUS_LABELS[status]}</Badge>;
}

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    <Badge variant={visibility === 'CLIENT_VISIBLE' ? 'info' : 'neutral'}>
      {VISIBILITY_LABELS[visibility]}
    </Badge>
  );
}