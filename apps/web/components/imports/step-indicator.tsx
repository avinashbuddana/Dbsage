import { Check } from 'lucide-react';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, index) => {
        const state = index < currentStep ? 'complete' : index === currentStep ? 'current' : 'upcoming';
        return (
          <li key={step} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                state === 'complete'
                  ? 'bg-blue-600 text-white'
                  : state === 'current'
                    ? 'border-2 border-blue-600 text-blue-600'
                    : 'border border-slate-300 text-slate-400'
              }`}
            >
              {state === 'complete' ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={state === 'upcoming' ? 'text-slate-400' : 'text-slate-900'}>{step}</span>
            {index < steps.length - 1 && <span aria-hidden="true" className="mx-2 h-px w-6 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}
