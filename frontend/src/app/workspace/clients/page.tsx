'use client';

import { useState } from 'react';
import { Building2, Search, UserPlus } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useAction, useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { workspaceService } from '@/services/workspace.service';
import type { ClientDto, CreateClientInput } from '@/types/api';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

const EMPTY_FORM: CreateClientInput = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  notes: '',
  address: '',
};

/**
 * Client companies for the current tenant.
 *
 * There is deliberately no agency selector: the list is whatever the server
 * returns for the signed-in user's agency, so no cross-tenant query can be
 * expressed by this page at all.
 */
export default function WorkspaceClientsPage(): JSX.Element {
  const toast = useToast();
  const { user } = useSession();
  const isAgencyAdmin = user?.role === 'AGENCY_ADMIN';

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<CreateClientInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClientDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) =>
      workspaceService.listClients({ page, limit: PAGE_SIZE, search: search || undefined }, signal),
    [page, search],
  );

  const save = useAction(async () => {
    if (editingId) return workspaceService.updateClient(editingId, form);
    return workspaceService.createClient(form);
  });

  const remove = useAction(async (id: string) => {
    await workspaceService.deleteClient(id);
  });

  const openCreate = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (client: ClientDto): void => {
    setEditingId(client.id);
    setForm({
      companyName: client.companyName,
      contactPerson: client.contactPerson,
      email: client.email,
      phone: client.phone ?? '',
      notes: client.notes ?? '',
      address: client.address ?? '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    const result = await save.run();
    if (result === undefined) {
      setFormError(save.error?.message ?? 'The client could not be saved.');
      return;
    }
    setIsFormOpen(false);
    toast.success(editingId ? 'Client updated.' : 'Client created.');
    reload();
  };

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const result = await remove.run(pendingDelete.id);
    if (result === undefined) {
      toast.error('Could not delete the client', remove.error?.message);
      return;
    }
    setPendingDelete(null);
    toast.success('Client deleted.');
    reload();
  };
  const columns: Column<ClientDto>[] = [
    {
      header: 'Company',
      cell: (client) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{client.companyName}</p>
          <p className="truncate text-xs text-muted-foreground">{client.contactPerson}</p>
        </div>
      ),
    },
    { header: 'Email', cell: (client) => <span className="text-sm">{client.email}</span> },
    { header: 'Phone', cell: (client) => <span className="text-sm">{client.phone ?? '—'}</span> },
    {
      header: 'Projects',
      cell: (client) => <span className="tabular-nums">{client.projectCount ?? 0}</span>,
      className: 'text-right',
    },
    {
      header: 'Status',
      cell: (client) => (
        <Badge variant={client.isActive ? 'success' : 'neutral'}>
          {client.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Created',
      cell: (client) => <span className="whitespace-nowrap text-sm">{formatDate(client.createdAt)}</span>,
    },
    ...(isAgencyAdmin
      ? [
          {
            header: '',
            cell: (client: ClientDto) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(client)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setPendingDelete(client)}
                >
                  Delete
                </Button>
              </div>
            ),
            className: 'text-right',
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Clients"
        description="Client companies managed by your agency."
        actions={
          isAgencyAdmin ? (
            <Button onClick={openCreate}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add client
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="border-b border-border p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Search by company, contact or email"
              className="pl-9"
              aria-label="Search clients"
            />
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load clients" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(client) => client.id}
              isLoading={isLoading}
              caption="Client companies"
              emptyState={
                <EmptyState
                  icon={Building2}
                  title="No clients found"
                  description={
                    search ? 'Try a different search term.' : 'Add your first client company to get started.'
                  }
                />
              }
            />
            {data ? <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} /> : null}
          </>
        )}
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit client' : 'Add client'}</DialogTitle>
            <DialogDescription>
              This client is attached to your agency and only visible to your team.
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
            <div className="space-y-2">
              <Label htmlFor="client-company">Company name</Label>
              <Input
                id="client-company"
                value={form.companyName}
                onChange={(event) => setForm({ ...form, companyName: event.target.value })}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-contact">Primary contact</Label>
                <Input
                  id="client-contact"
                  value={form.contactPerson}
                  onChange={(event) => setForm({ ...form, contactPerson: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email">Email</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client-phone">Phone</Label>
                <Input
                  id="client-phone"
                  value={form.phone ?? ''}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-address">Address</Label>
                <Input
                  id="client-address"
                  value={form.address ?? ''}
                  onChange={(event) => setForm({ ...form, address: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                value={form.notes ?? ''}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={save.isPending}>
                {editingId ? 'Save changes' : 'Create client'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this client?"
        description={
          pendingDelete ? (
            <>
              <span className="font-medium">{pendingDelete.companyName}</span> and its portal access will be
              removed. Projects are not deleted automatically.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete client"
        destructive
        isPending={remove.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}