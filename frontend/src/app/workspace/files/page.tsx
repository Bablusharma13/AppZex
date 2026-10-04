'use client';

import { useRef, useState } from 'react';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { VisibilityBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { useAction, useAsyncData } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { fileService } from '@/services/file.service';
import { workspaceService } from '@/services/workspace.service';
import type { FileDto, FileListQuery } from '@/types/api';
import { FILE_ENTITY_TYPE, VISIBILITY, type FileEntityType, type Visibility } from '@/types/enums';
import { formatBytes, formatDateTime } from '@/utils/format';

const PAGE_SIZE = 20;

/**
 * File attachments.
 *
 * Downloads are authenticated fetches, not plain links: the backend re-checks
 * identity, tenant, client ownership and visibility before streaming a byte, so
 * there is deliberately no public or permanently signed URL anywhere.
 */
export default function WorkspaceFilesPage(): JSX.Element {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState<FileEntityType | ''>('');
  const [visibility, setVisibility] = useState<Visibility | ''>('');
  const [pendingDelete, setPendingDelete] = useState<FileDto | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [target, setTarget] = useState({ relatedEntityId: '', visibility: 'INTERNAL' as Visibility });

  const query: FileListQuery = {
    page,
    limit: PAGE_SIZE,
    relatedEntityType: entityType || undefined,
    visibility: visibility || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => workspaceService.listFiles(query, signal),
    [page, entityType, visibility],
  );

  const projects = useAsyncData(
    (signal) => workspaceService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );

  const upload = useAction(async (file: File) => {
    if (!target.relatedEntityId) throw new Error('Select the project to attach this file to.');
    return workspaceService.uploadFile(file, {
      relatedEntityType: 'PROJECT',
      relatedEntityId: target.relatedEntityId,
      visibility: target.visibility,
    });
  });

  const remove = useAction(async (id: string) => {
    await workspaceService.deleteFile(id);
  });

  const handleFileChosen = async (fileList: FileList | null): Promise<void> => {
    const file = fileList?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await upload.run(file);
      toast.success('File uploaded.');
      reload();
    } catch {
      setUploadError(upload.error?.message ?? 'The file could not be uploaded.');
    } finally {
      // Allow re-selecting the same file after a failure.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (file: FileDto): Promise<void> => {
    try {
      await fileService.save(file);
    } catch (caught) {
      toast.error('Download blocked', (caught as Error).message);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const result = await remove.run(pendingDelete.id);
    if (result === undefined) {
      toast.error('Could not delete the file', remove.error?.message);
      return;
    }
    setPendingDelete(null);
    toast.success('File deleted.');
    reload();
  };
  const columns: Column<FileDto>[] = [
    {
      header: 'File',
      cell: (file) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{file.originalName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {file.relatedEntityType} · {formatBytes(file.size)}
          </p>
        </div>
      ),
    },
    { header: 'Type', cell: (file) => <span className="text-xs text-muted-foreground">{file.mimeType}</span> },
    { header: 'Visibility', cell: (file) => <VisibilityBadge visibility={file.visibility} /> },
    { header: 'Uploaded by', cell: (file) => <span className="text-sm">{file.uploadedByName}</span> },
    {
      header: 'Uploaded',
      cell: (file) => <span className="whitespace-nowrap text-sm">{formatDateTime(file.createdAt)}</span>,
    },
    {
      header: '',
      cell: (file) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleDownload(file)}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setPendingDelete(file)}
            aria-label={`Delete ${file.originalName}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <>
      <PageHeader title="Files" description="Attachments on your projects and records." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
            Upload a file
          </CardTitle>
        </CardHeader>
        <CardHeader className="pt-0">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="file-project">Attach to project</Label>
              <Select
                id="file-project"
                value={target.relatedEntityId}
                onChange={(event) => setTarget({ ...target, relatedEntityId: event.target.value })}
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
              <Label htmlFor="file-visibility">Visibility</Label>
              <Select
                id="file-visibility"
                value={target.visibility}
                onChange={(event) => setTarget({ ...target, visibility: event.target.value as Visibility })}
              >
                <option value="INTERNAL">Internal only</option>
                <option value="CLIENT_VISIBLE">Client visible</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardHeader className="pt-0">
          <div className="space-y-2">
            <Label htmlFor="file-input">File</Label>
            <Input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(event) => void handleFileChosen(event.target.files)}
              disabled={!target.relatedEntityId || upload.isPending}
            />
            {uploadError ? (
              <InlineAlert message={uploadError} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose a project first. Files are never served from a public URL.
              </p>
            )}
          </div>
        </CardHeader>
      </Card>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="file-filter-entity">Attached to</Label>
            <Select
              id="file-filter-entity"
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value as FileEntityType | '');
                setPage(1);
              }}
            >
              <option value="">All record types</option>
              {Object.values(FILE_ENTITY_TYPE).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="file-filter-visibility">Visibility</Label>
            <Select
              id="file-filter-visibility"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value as Visibility | '');
                setPage(1);
              }}
            >
              <option value="">All visibilities</option>
              <option value={VISIBILITY.INTERNAL}>Internal only</option>
              <option value={VISIBILITY.CLIENT_VISIBLE}>Client visible</option>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load files" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(file) => file.id}
              isLoading={isLoading}
              caption="Files attached to your projects and records"
              emptyState={
                <EmptyState
                  icon={Paperclip}
                  title="No files yet"
                  description="Upload a document above to attach it to one of your projects."
                />
              }
            />
            {data ? (
              <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} />
            ) : null}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this file?"
        description={
          <>
            <strong>{pendingDelete?.originalName}</strong> will be permanently removed from the
            workspace. This cannot be undone.
          </>
        }
        confirmLabel="Delete file"
        destructive
        isPending={remove.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}