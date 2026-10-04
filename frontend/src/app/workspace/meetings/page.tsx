'use client';

import { useState } from 'react';
import { Calendar, Plus, Sparkles, Wand2 } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { VisibilityBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAction, useAsyncData } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { aiService, collabService } from '@/services/collab.service';
import { workspaceService } from '@/services/workspace.service';
import type { AiSummaryResult, CreateMeetingInput, MeetingDto } from '@/types/api';
import { VISIBILITY, type Visibility } from '@/types/enums';
import { formatDateTime } from '@/utils/format';

const PAGE_SIZE = 20;

/**
 * Meetings and the AI summary workflow.
 *
 * The AI call is scoped by meeting id, which the backend resolves inside the
 * caller's tenant before anything reaches the provider. A provider failure is
 * surfaced inline and never blocks the rest of the page.
 */
export default function WorkspaceMeetingsPage(): JSX.Element {
  const toast = useToast();
  const { user } = useSession();
  const isAgencyAdmin = user?.role === 'AGENCY_ADMIN';

  const [page, setPage] = useState(1);
  const [projectId, setProjectId] = useState('');
  const [visibility, setVisibility] = useState<Visibility | ''>('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MeetingDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateMeetingInput>(emptyMeeting(''));

  const [aiMeeting, setAiMeeting] = useState<MeetingDto | null>(null);
  const [aiResult, setAiResult] = useState<AiSummaryResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) =>
      collabService.listMeetings(
        {
          page,
          limit: PAGE_SIZE,
          projectId: projectId || undefined,
          visibility: visibility || undefined,
        },
        signal,
      ),
    [page, projectId, visibility],
  );

  const projects = useAsyncData(
    (signal) => workspaceService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );

  const save = useAction(async () => {
    if (editingId) return collabService.updateMeeting(editingId, form);
    return collabService.createMeeting(form);
  });

  const remove = useAction(async (id: string) => {
    await collabService.deleteMeeting(id);
  });

  const generate = useAction(async (meetingId: string) => aiService.generateSummary(meetingId));

  const convert = useAction(async (meetingId: string) => {
    const items = (aiResult?.actionItems ?? []).map((item) => ({ title: item.title }));
    if (items.length === 0) return { created: 0, tasks: [] };
    return aiService.convertActionItemsToTasks(meetingId, items);
  });
  const openCreate = (): void => {
    setEditingId(null);
    setForm(emptyMeeting(projectId));
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (meeting: MeetingDto): void => {
    setEditingId(meeting.id);
    setForm({
      projectId: meeting.projectId,
      title: meeting.title,
      date: meeting.date?.slice(0, 16) ?? '',
      durationMinutes: meeting.durationMinutes ?? 60,
      agenda: meeting.agenda ?? '',
      notes: meeting.notes ?? '',
      internalNotes: meeting.internalNotes ?? '',
      visibility: meeting.visibility,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    const result = await save.run();
    if (result === undefined) {
      setFormError(save.error?.message ?? 'The meeting could not be saved.');
      return;
    }
    setIsFormOpen(false);
    toast.success(editingId ? 'Meeting updated.' : 'Meeting created.');
    reload();
  };

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const result = await remove.run(pendingDelete.id);
    if (result === undefined) {
      toast.error('Could not delete the meeting', remove.error?.message);
      return;
    }
    setPendingDelete(null);
    toast.success('Meeting deleted.');
    reload();
  };

  /** Opens the AI dialog, pre-filling an already-saved summary when present. */
  const openAi = (meeting: MeetingDto): void => {
    setAiMeeting(meeting);
    setAiError(null);
    setAiResult(
      meeting.aiSummary
        ? {
            meetingId: meeting.id,
            summary: meeting.aiSummary.summary,
            decisions: meeting.aiSummary.decisions,
            actionItems: meeting.aiSummary.actionItems,
            deadlines: meeting.aiSummary.deadlines,
            model: meeting.aiSummary.model,
          }
        : null,
    );
  };

  const handleGenerate = async (): Promise<void> => {
    if (!aiMeeting) return;
    const result = await generate.run(aiMeeting.id);
    if (result === undefined) {
      setAiError(generate.error?.message ?? 'The AI provider could not be reached.');
      return;
    }
    toast.success('AI summary generated. Review and edit before saving.');
  };

  const handleConvert = async (): Promise<void> => {
    if (!aiMeeting) return;
    const result = await convert.run(aiMeeting.id);
    if (result === undefined) {
      toast.error('Could not create tasks', convert.error?.message);
      return;
    }
    toast.success(`${result.created} action item(s) converted to tasks.`);
  };
  const columns: Column<MeetingDto>[] = [
    {
      header: 'Meeting',
      cell: (meeting) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{meeting.title}</p>
          <p className="truncate text-xs text-muted-foreground">{meeting.project?.name ?? '—'}</p>
        </div>
      ),
    },
    {
      header: 'Date',
      cell: (meeting) => <span className="whitespace-nowrap text-sm">{formatDateTime(meeting.date)}</span>,
    },
    { header: 'Visibility', cell: (meeting) => <VisibilityBadge visibility={meeting.visibility} /> },
    {
      header: 'AI summary',
      cell: (meeting) =>
        meeting.aiSummary ? (
          <span className="text-xs text-emerald-700">Generated</span>
        ) : (
          <span className="text-xs text-muted-foreground">Not generated</span>
        ),
    },
    {
      header: '',
      cell: (meeting) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openAi(meeting)}>
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            AI
          </Button>
          <Button variant="outline" size="sm" onClick={() => openEdit(meeting)}>
            Edit
          </Button>
          {isAgencyAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setPendingDelete(meeting)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Client-visible meetings appear in the client portal. Internal notes never do."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New meeting
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPage(1);
            }}
            className="sm:w-56"
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.data?.items.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <Select
            value={visibility}
            onChange={(event) => {
              setVisibility(event.target.value as Visibility | '');
              setPage(1);
            }}
            className="sm:w-48"
            aria-label="Filter by visibility"
          >
            <option value="">All visibility</option>
            {Object.values(VISIBILITY).map((value) => (
              <option key={value} value={value}>
                {value === 'CLIENT_VISIBLE' ? 'Client visible' : 'Internal'}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load meetings" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(meeting) => meeting.id}
              isLoading={isLoading}
              caption="Meetings"
              emptyState={<EmptyState icon={Calendar} title="No meetings found" />}
            />
            {data ? <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} /> : null}
          </>
        )}
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit meeting' : 'New meeting'}</DialogTitle>
            <DialogDescription>
              Internal notes stay inside your agency; client-visible notes are shared with the client.
            </DialogDescription>
          </DialogHeader>
          {formError ? <InlineAlert message={formError} /> : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meeting-project">Project</Label>
                <Select
                  id="meeting-project"
                  value={form.projectId}
                  onChange={(event) => setForm({ ...form, projectId: event.target.value })}
                  required
                >
                  <option value="">Select a project</option>
                  {projects.data?.items.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-date">Date and time</Label>
                <Input
                  id="meeting-date"
                  type="datetime-local"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meeting-duration">Duration (minutes)</Label>
                <Input
                  id="meeting-duration"
                  type="number"
                  min={5}
                  max={600}
                  value={form.durationMinutes ?? 60}
                  onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-visibility">Visibility</Label>
                <Select
                  id="meeting-visibility"
                  value={form.visibility}
                  onChange={(event) => setForm({ ...form, visibility: event.target.value as Visibility })}
                >
                  <option value="CLIENT_VISIBLE">Client visible</option>
                  <option value="INTERNAL">Internal only</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-agenda">Agenda</Label>
              <Textarea
                id="meeting-agenda"
                value={form.agenda ?? ''}
                onChange={(event) => setForm({ ...form, agenda: event.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-notes">Notes</Label>
              <Textarea
                id="meeting-notes"
                value={form.notes ?? ''}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-internal">Internal notes (never shared with the client)</Label>
              <Textarea
                id="meeting-internal"
                value={form.internalNotes ?? ''}
                onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={save.isPending}>
                {editingId ? 'Save changes' : 'Create meeting'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this meeting?"
        description={pendingDelete ? `“${pendingDelete.title}” and any saved AI summary will be removed.` : ''}
        confirmLabel="Delete meeting"
        destructive
        isPending={remove.isPending}
        onConfirm={handleDelete}
      />
      <Dialog open={aiMeeting !== null} onOpenChange={(open) => !open && setAiMeeting(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>AI meeting summary</DialogTitle>
            <DialogDescription>
              Only this meeting&apos;s notes are sent to the provider. Review and edit the output before
              saving it to the meeting.
            </DialogDescription>
          </DialogHeader>

          {aiError ? <InlineAlert message={aiError} variant="warning" /> : null}

          <div className="space-y-4">
            <Button
              onClick={() => void handleGenerate()}
              isLoading={generate.isPending}
              className="w-full"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {aiResult ? 'Regenerate summary' : 'Generate AI Summary'}
            </Button>

            {aiResult ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm">{aiResult.summary}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Decisions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiResult.decisions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No decisions recorded.</p>
                    ) : (
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {aiResult.decisions.map((decision, index) => (
                          <li key={`${decision}-${index}`}>{decision}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Action items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiResult.actionItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No action items identified.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {aiResult.actionItems.map((item, index) => (
                          <li key={`${item.title}-${index}`} className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{item.title}</span>
                            {item.owner ? (
                              <span className="text-xs text-muted-foreground">owner: {item.owner}</span>
                            ) : null}
                            {item.dueDate ? (
                              <span className="text-xs text-muted-foreground">due: {item.dueDate}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Deadlines</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiResult.deadlines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No deadlines identified.</p>
                    ) : (
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {aiResult.deadlines.map((deadline, index) => (
                          <li key={`${deadline}-${index}`}>{deadline}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground">
                  Generated with {aiResult.model}. Review before sharing with the client.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No summary yet. Generate one to turn the notes into decisions, action items and deadlines.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiMeeting(null)}>
              Close
            </Button>
            {aiResult && aiResult.actionItems.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => void handleConvert()}
                isLoading={convert.isPending}
              >
                Convert {aiResult.actionItems.length} item(s) to tasks
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function emptyMeeting(projectId: string): CreateMeetingInput {
  return {
    projectId,
    title: '',
    date: new Date().toISOString().slice(0, 16),
    durationMinutes: 60,
    agenda: '',
    notes: '',
    internalNotes: '',
    visibility: 'CLIENT_VISIBLE',
  };
}