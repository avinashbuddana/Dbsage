'use client';

import { UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  error?: string;
}

export function FileDropzone({ onFileSelected, error }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div>
      <div
        data-testid="file-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => {
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white'
        }`}
      >
        <UploadCloud className="h-10 w-10 text-blue-600" aria-hidden="true" />
        <p className="mt-4 text-base font-medium text-slate-900">Drop your CSV file here</p>
        <p className="mt-1 text-sm text-slate-500">
          or{' '}
          <button
            type="button"
            onClick={() => {
              inputRef.current?.click();
            }}
            className="font-medium text-blue-600 hover:text-blue-700"
          >
            choose a file
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Upload CSV file"
          onChange={(event) => {
            handleFiles(event.target.files);
          }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
