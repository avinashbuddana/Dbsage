'use client';

import { useState } from 'react';

import { isValidOrganizationId, useOrganization } from '../../lib/organization-context';

export function WorkspaceIndicator() {
  const { organizationId, setOrganizationId } = useOrganization();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(organizationId ?? '');
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = draft.trim();
          if (!isValidOrganizationId(trimmed)) {
            setError('Enter a valid UUID.');
            return;
          }
          setOrganizationId(trimmed);
          setError(null);
          setEditing(false);
        }}
      >
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Organization UUID"
          aria-label="Organization ID"
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(organizationId ?? '');
        setEditing(true);
      }}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
    >
      {organizationId ? `Workspace: ${organizationId.slice(0, 8)}…` : 'Set workspace'}
      <span className="ml-2 font-medium text-blue-600">Change</span>
    </button>
  );
}
