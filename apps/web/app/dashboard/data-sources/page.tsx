import { Database } from 'lucide-react';

import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';

export default function DataSourcesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Data Management" title="Data Sources" description="Connect and manage external database connections." />
      <EmptyState
        icon={Database}
        title="Coming soon"
        description="Data source management is not part of this milestone yet. CSV imports into the SchemaIQ PostgreSQL database are available today under Data Imports."
      />
    </div>
  );
}
