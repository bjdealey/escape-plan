import * as React from 'react';
import { Check, Mail, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGroups } from '@/store/groups';
import { usePlanner } from '@/store/planner';
import { formatDateShort } from '@/lib/utils';
import type { LeaveState, PrivacySetting, Role } from '@escape-plan/engine';

/** Run a store mutation and surface any authorization/validation error inline. */
function useAction(setError: (m: string | null) => void) {
  return (fn: () => void) => {
    try {
      fn();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };
}

const STATE_VARIANT: Record<LeaveState, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  draft: 'secondary',
  requested: 'warning',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

export function GroupView() {
  const g = useGroups();
  const [error, setError] = React.useState<string | null>(null);
  const run = useAction(setError);
  const groupId = g.selectedGroupId ?? g.myGroups[0]?.group.id ?? null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div role="alert" aria-live="assertive">
        {error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <InvitationsForMe />

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Your groups">
        {g.myGroups.map(({ group, role }) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={group.id === groupId}
            onClick={() => g.selectGroup(group.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              group.id === groupId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-secondary'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            {group.name}
            <span className="text-xs opacity-80">· {role}</span>
          </button>
        ))}
        {g.myGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You’re not in any group yet. Accept an invitation to join one.
          </p>
        ) : null}
      </div>

      {groupId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <MembersCard groupId={groupId} run={run} />
          <InvitesCard groupId={groupId} run={run} />
          <ApprovalCard groupId={groupId} run={run} />
          <SharingCard groupId={groupId} run={run} />
        </div>
      ) : null}
    </div>
  );
}

function InvitationsForMe() {
  const g = useGroups();
  const [error, setError] = React.useState<string | null>(null);
  const run = useAction(setError);
  if (g.invitationsForMe.length === 0) return null;
  return (
    <Card glass>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" /> Invitations for you
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {g.invitationsForMe.map((inv) => {
          const group = g.groups.find((x) => x.id === inv.groupId);
          return (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
            >
              <span className="text-sm">
                Join <strong>{group?.name}</strong> as {inv.role}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => run(() => g.acceptInvite(inv.token))}>
                  <Check className="h-4 w-4" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(() => g.declineInvite(inv.token))}
                >
                  <X className="h-4 w-4" /> Decline
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const PRIVACY_LABEL: Record<PrivacySetting, string> = {
  full: 'Full details',
  busy: 'Busy only',
  private: 'Private',
};

function MembersCard({ groupId, run }: { groupId: string; run: (fn: () => void) => void }) {
  const g = useGroups();
  const members = g.membersOf(groupId);
  const myPrivacy = members.find((m) => m.userId === g.currentUser.id)?.privacy ?? 'full';
  const canLeave = g.roleIn(groupId) !== null;

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Members
        </CardTitle>
        {canLeave ? (
          <Button size="sm" variant="ghost" onClick={() => run(() => g.leaveGroup(groupId))}>
            Leave
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {m.name}
                {m.userId === g.currentUser.id ? (
                  <span className="text-xs text-muted-foreground">(you)</span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={m.role === 'owner' ? 'default' : 'secondary'}>{m.role}</Badge>
                <span className="text-xs text-muted-foreground">
                  {m.userId === g.currentUser.id ? PRIVACY_LABEL[m.privacy] : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div>
          <Label htmlFor="privacy" className="mb-1 block text-xs">
            My leave privacy in this group
          </Label>
          <Select
            value={myPrivacy}
            onValueChange={(v) => run(() => g.setPrivacy(groupId, v as PrivacySetting))}
          >
            <SelectTrigger id="privacy" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['full', 'busy', 'private'] as PrivacySetting[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIVACY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function InvitesCard({ groupId, run }: { groupId: string; run: (fn: () => void) => void }) {
  const g = useGroups();
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<Role>('member');
  const canInvite = g.can('group.invite', groupId);
  const invites = g.invitesFor(groupId);

  return (
    <Card glass>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary" /> Invites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canInvite ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => {
                g.invite(groupId, email, role);
                setEmail('');
              });
            }}
          >
            <div className="flex-1 min-w-[10rem]">
              <Label htmlFor="invite-email" className="mb-1 block text-xs">
                Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="h-10 w-32" aria-label="Invite role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['member', 'approver', 'admin'] as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Invite</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            You don’t have permission to invite in this group.
          </p>
        )}

        <ul className="space-y-1.5">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{inv.email}</span>
              <span className="flex items-center gap-2">
                <Badge variant={inv.status === 'pending' ? 'warning' : 'secondary'}>
                  {inv.status}
                </Badge>
                {canInvite && inv.status === 'pending' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => run(() => g.revokeInvite(groupId, inv.id))}
                  >
                    Revoke
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
          {invites.length === 0 ? (
            <li className="text-sm text-muted-foreground">No invites yet.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function ApprovalCard({ groupId, run }: { groupId: string; run: (fn: () => void) => void }) {
  const g = useGroups();
  const [start, setStart] = React.useState('2026-10-05');
  const [end, setEnd] = React.useState('2026-10-09');
  const requests = g.requestsFor(groupId);
  const likelihood = g.approvalLikelihood(groupId, start, end);

  return (
    <Card glass>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" /> Leave requests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => g.requestLeave(groupId, start, end));
          }}
        >
          <div>
            <Label htmlFor="req-start" className="mb-1 block text-xs">
              From
            </Label>
            <Input id="req-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="req-end" className="mb-1 block text-xs">
              To
            </Label>
            <Input id="req-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button type="submit">Request</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Approval likelihood for these dates:{' '}
          <span className="font-semibold text-foreground">{Math.round(likelihood * 100)}%</span>{' '}
          (from real group overlap &amp; capacity).
        </p>

        <ul className="space-y-2">
          {requests.map((r) => {
            const who = g.membersOf(groupId).find((m) => m.userId === r.userId)?.name ?? `User ${r.userId}`;
            const canDecide = g.can('leave.approve', groupId, r.userId === g.currentUser.id) && r.state === 'pending';
            return (
              <li key={r.id} className="rounded-lg border border-border bg-card p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {who}: {formatDateShort(r.start)}–{formatDateShort(r.end)}
                  </span>
                  <Badge variant={STATE_VARIANT[r.state]}>{r.state}</Badge>
                </div>
                {r.reason ? <p className="mt-1 text-xs text-muted-foreground">“{r.reason}”</p> : null}
                {canDecide ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => run(() => g.decideLeave(r.id, 'approved'))}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(() => g.decideLeave(r.id, 'rejected', 'Not this week'))}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
          {requests.length === 0 ? (
            <li className="text-sm text-muted-foreground">No requests to show.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function SharingCard({ groupId, run }: { groupId: string; run: (fn: () => void) => void }) {
  const g = useGroups();
  const { selectedPlanId } = usePlanner();
  const access = g.planAccess(selectedPlanId);
  const shares = g.shares.filter((s) => s.planId === selectedPlanId);

  return (
    <Card glass>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Share this plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          Your access to <span className="font-medium text-foreground">{selectedPlanId}</span>:
          <Badge variant={access.canEdit ? 'success' : access.canView ? 'secondary' : 'outline'}>
            {access.level}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run(() => g.sharePlan(selectedPlanId, groupId, 'view'))}>
            Share view-only
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run(() => g.sharePlan(selectedPlanId, groupId, 'coedit'))}
          >
            Share for co-edit
          </Button>
        </div>
        <ul className="space-y-1.5">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {g.groups.find((x) => x.id === s.groupId)?.name ?? 'member'} · {s.level}
              </span>
              {s.ownerUserId === g.currentUser.id ? (
                <Button size="sm" variant="ghost" onClick={() => run(() => g.revokeShare(s.id))}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
          {shares.length === 0 ? (
            <li className="text-sm text-muted-foreground">Not shared yet.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
