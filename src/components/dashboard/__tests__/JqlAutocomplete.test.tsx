import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/mock-store';
import { JqlAutocomplete } from '../JqlAutocomplete';

// jsdom does not implement Element.scrollIntoView, which cmdk invokes when
// syncing the active item into view. Provide a no-op so rendering doesn't throw.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {} as unknown as Element['scrollIntoView'];
}

const FILTER_OPTIONS = {
  status: ['Done', 'Open'],
  priority: ['High', 'Low'],
  project: ['PROJ'],
  issueType: ['Bug'],
  assignee: ['Alice'],
  label: ['x'],
  component: ['c'],
};

describe('JqlAutocomplete', () => {
  it('renders the input with the default placeholder', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <JqlAutocomplete value="" onChange={onChange} filterOptions={FILTER_OPTIONS} />,
    );

    const input = screen.getByPlaceholderText(/filter by jql/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // No suggestions shown before the user types.
    expect(screen.queryByText('status')).not.toBeInTheDocument();
  });

  it('shows field suggestions while typing', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <JqlAutocomplete value="" onChange={onChange} filterOptions={FILTER_OPTIONS} />,
    );

    const input = screen.getByPlaceholderText(/filter by jql/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'stat', selectionStart: 4, selectionEnd: 4 } });

    // "stat" matches the "status" (and "statusCategory") field suggestions.
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('statusCategory')).toBeInTheDocument();
  });

  it('shows value suggestions after a field + operator', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <JqlAutocomplete value="" onChange={onChange} filterOptions={FILTER_OPTIONS} />,
    );

    const input = screen.getByPlaceholderText(/filter by jql/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'status ==', selectionStart: 9, selectionEnd: 9 } });

    // status values from filterOptions are quoted.
    expect(screen.getByText(/Done/)).toBeInTheDocument();
    expect(screen.getByText(/Open/)).toBeInTheDocument();
  });

  it('inserts a selected suggestion into the query via onChange', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <JqlAutocomplete value="" onChange={onChange} filterOptions={FILTER_OPTIONS} />,
    );

    const input = screen.getByPlaceholderText(/filter by jql/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'stat', selectionStart: 4, selectionEnd: 4 } });

    // Click the "status" field suggestion — cmdk fires onSelect via onClick.
    fireEvent.click(screen.getByText('status'));

    expect(onChange).toHaveBeenCalledWith('status ');
  });

  it('propagates typed text to the parent onChange', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <JqlAutocomplete value="" onChange={onChange} filterOptions={FILTER_OPTIONS} />,
    );

    const input = screen.getByPlaceholderText(/filter by jql/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'priority', selectionStart: 8, selectionEnd: 8 } });

    expect(onChange).toHaveBeenCalledWith('priority');
  });
});
