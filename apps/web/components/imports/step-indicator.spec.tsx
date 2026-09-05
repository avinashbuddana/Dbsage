import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StepIndicator } from './step-indicator';

describe('StepIndicator', () => {
  it('marks the current step with aria-current and leaves other steps unmarked', () => {
    render(<StepIndicator steps={['Upload', 'Destination', 'Map Columns', 'Review', 'Import']} currentStep={2} />);

    expect(screen.getByText('Map Columns').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Import').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Upload').closest('li')).not.toHaveAttribute('aria-current');
  });
});
