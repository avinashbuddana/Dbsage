import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileDropzone } from './file-dropzone';

describe('FileDropzone', () => {
  it('calls onFileSelected when a file is chosen via the picker', async () => {
    const onFileSelected = vi.fn();
    const user = userEvent.setup();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    await user.upload(screen.getByLabelText('Upload CSV file'), file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('calls onFileSelected when a file is dropped', () => {
    const onFileSelected = vi.fn();
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
    const { container } = render(<FileDropzone onFileSelected={onFileSelected} />);
    const dropzone = container.querySelector('[data-testid="file-dropzone"]');
    if (!dropzone) throw new Error('Expected the dropzone element to be rendered');

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('shows a validation error message near the uploader', () => {
    render(<FileDropzone onFileSelected={vi.fn()} error="Unsupported file type" />);
    expect(screen.getByText('Unsupported file type')).toBeInTheDocument();
  });
});
