'use client';

import { useState } from 'react';

import { friendlyImportErrorMessage } from '../../lib/error-copy';

interface ErrorPanelProps {
  errorCode: string | null;
  errorMessage: string | null;
}

export function ErrorPanel({ errorCode, errorMessage }: ErrorPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <h3 className="text-base font-semibold text-red-900">Import could not be completed</h3>
      <p className="mt-2 text-sm text-red-800">{friendlyImportErrorMessage(errorCode)}</p>
      {(errorCode ?? errorMessage) && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setShowDetails((value) => !value);
            }}
            className="text-sm font-medium text-red-700 underline"
          >
            Technical details
          </button>
          {showDetails && (
            <dl className="mt-2 flex flex-col gap-1 rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-600">
              {errorCode && (
                <div className="flex gap-2">
                  <dt className="font-semibold">Code:</dt>
                  <dd>{errorCode}</dd>
                </div>
              )}
              {errorMessage && (
                <div className="flex gap-2">
                  <dt className="font-semibold">Message:</dt>
                  <dd>{errorMessage}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
