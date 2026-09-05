import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const useImportConfigMock = vi.fn();
const useImportTableDetailsMock = vi.fn();
vi.mock('../../../../lib/queries/imports-queries', () => ({
  useImportConfig: (): unknown => useImportConfigMock(),
  useImportTableDetails: (...args: unknown[]): unknown => useImportTableDetailsMock(...args),
}));

const mutateAsync = vi.fn();
vi.mock('../../../../lib/queries/imports-mutations', () => ({
  useCreateImport: (): unknown => ({ mutateAsync }),
}));

vi.mock('../../../../components/imports/file-dropzone', () => ({
  FileDropzone: ({ onFileSelected }: { onFileSelected: (file: File) => void }) => (
    <button
      onClick={() => {
        onFileSelected(new File(['email,last_name\njohn@example.com,Smith'], 'customers.csv', { type: 'text/csv' }));
      }}
    >
      mock-upload
    </button>
  ),
}));
vi.mock('../../../../components/imports/file-summary', () => ({
  FileSummary: ({ file }: { file: File }) => <div>{file.name}</div>,
}));
vi.mock('../../../../components/imports/destination-step', () => ({
  DestinationStep: ({
    onSchemaChange,
    onTableChange,
    onCreateTableChange,
  }: {
    onSchemaChange: (schema: string) => void;
    onTableChange: (table: string) => void;
    onCreateTableChange?: (createTable: boolean) => void;
  }) => (
    <div>
      <button
        onClick={() => {
          onSchemaChange('public');
        }}
      >
        mock-select-schema
      </button>
      <button
        onClick={() => {
          onTableChange('customers');
        }}
      >
        mock-select-table
      </button>
      <button
        onClick={() => {
          onCreateTableChange?.(true);
          onTableChange('new_customers');
        }}
      >
        mock-create-new-table
      </button>
    </div>
  ),
}));
vi.mock('../../../../components/imports/column-mapping-table', () => ({
  ColumnMappingTable: () => <div>mock-mapping-table</div>,
}));
vi.mock('../../../../components/imports/new-table-columns-table', () => ({
  NewTableColumnsTable: () => <div>mock-new-table-columns</div>,
}));
vi.mock('../../../../components/imports/import-summary', () => ({
  ImportSummary: ({ onStart }: { onStart: () => void }) => <button onClick={onStart}>mock-start-import</button>,
}));

import NewImportPage from './page';

const requiredColumn = { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' };
const matchedColumn = { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'last_name' };

describe('NewImportPage', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mutateAsync.mockClear();
    useImportConfigMock.mockReturnValue({ data: { queueThresholdBytes: 5_242_880 } });
    useImportTableDetailsMock.mockReturnValue({
      data: { columns: [requiredColumn, matchedColumn], schema: 'public', table: 'customers' },
    });
  });

  async function uploadMockFileAndWait(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByText('mock-upload'));
    // previewCsv reads the file via FileReader, which resolves asynchronously
    // (on a later tick than the click itself) -- wait for that to land before
    // asserting on or acting on state that depends on it.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
    });
  }

  it('does not allow continuing past Upload until a file is chosen', async () => {
    const user = userEvent.setup();
    render(<NewImportPage />);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await uploadMockFileAndWait(user);
  });

  it('does not allow continuing past Destination until schema and table are chosen', async () => {
    const user = userEvent.setup();
    render(<NewImportPage />);
    await uploadMockFileAndWait(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('starts the import with the auto-matched column mapping and navigates to the detail page on success', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 'import-123' }, status: 201 });
    const user = userEvent.setup();
    render(<NewImportPage />);

    await uploadMockFileAndWait(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    const call = mutateAsync.mock.calls[0]?.[0] as {
      input: { columnMapping: Record<string, string>; targetSchema: string; targetTable: string };
    };
    expect(call.input.columnMapping).toEqual({ email: 'email', last_name: 'last_name' });
    expect(call.input.targetSchema).toBe('public');
    expect(call.input.targetTable).toBe('customers');
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/imports/import-123');
    });
  });

  it('starts an import that creates a new table from the CSV header', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 'import-456' }, status: 201 });
    const user = userEvent.setup();
    render(<NewImportPage />);

    await uploadMockFileAndWait(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-create-new-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    const call = mutateAsync.mock.calls[0]?.[0] as {
      input: { columnMapping: Record<string, string>; createTable: boolean; targetSchema: string; targetTable: string };
    };
    expect(call.input.createTable).toBe(true);
    expect(call.input.targetTable).toBe('new_customers');
    expect(call.input.columnMapping).toEqual({ email: 'email', last_name: 'last_name' });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/dashboard/imports/import-456');
    });
  });

  it('shows a friendly error and does not navigate when starting the import fails', async () => {
    mutateAsync.mockRejectedValue(new Error('SchemaIQ could not reach the server. Check your connection and try again.'));
    const user = userEvent.setup();
    render(<NewImportPage />);

    await uploadMockFileAndWait(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    await screen.findByText("We couldn't start the import");
    expect(screen.getByText(/SchemaIQ could not reach the server/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows the duplicate-import details and a link to the existing import when the upload is rejected as a duplicate', async () => {
    const { ApiError } = await import('../../../../lib/api-client');
    mutateAsync.mockRejectedValue(
      new ApiError({
        code: 'DUPLICATE_IMPORT',
        existingImportId: 'import-999',
        message: 'This file has already been imported into public.customers.',
        previousImport: {
          failedRows: '20',
          fileName: 'customers.csv',
          importedAt: '2026-09-05T10:30:00Z',
          successfulRows: '14980',
          totalRows: '15000',
        },
        requestId: 'req-1',
        statusCode: 409,
      }),
    );
    const user = userEvent.setup();
    render(<NewImportPage />);

    await uploadMockFileAndWait(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    await screen.findByText('File Already Imported');
    expect(screen.getByText(/14,980 rows/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View existing import' })).toHaveAttribute(
      'href',
      '/dashboard/imports/import-999',
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
