import { WorkspaceIndicator } from '../../../components/layout/workspace-indicator';
import { PageHeader } from '../../../components/ui/page-header';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="SchemaIQ does not have authentication yet. Use this development workspace control to scope your data to an organization."
      />
      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Workspace</h2>
        <p className="mt-2 text-sm text-slate-600">
          Every request SchemaIQ makes is scoped to this organization ID. It is stored only in this browser.
        </p>
        <div className="mt-4">
          <WorkspaceIndicator />
        </div>
      </div>
    </div>
  );
}
