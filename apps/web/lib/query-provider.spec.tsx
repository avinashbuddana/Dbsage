import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QueryProvider } from './query-provider';

function Probe() {
  const { data } = useQuery({ queryFn: () => Promise.resolve('ready'), queryKey: ['probe'] });
  return <span>{data ?? 'loading'}</span>;
}

describe('QueryProvider', () => {
  it('provides a working query client to descendants', async () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });
  });
});
