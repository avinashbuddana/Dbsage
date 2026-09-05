import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Metric } from './metric';

describe('Metric', () => {
  it('renders the value and label', () => {
    render(<Metric label="Total Imports" value="128" />);

    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Total Imports')).toBeInTheDocument();
  });
});
