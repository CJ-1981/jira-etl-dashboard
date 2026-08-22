import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test/mock-store';
import { KpiFilterPanel } from '../KpiFilterPanel';
import type { UseJqlFiltersResult } from '@/hooks/useJqlFilters';

// JqlAutocomplete has its own test suite; render a plain controlled input here
// so the panel's own wiring (value/onChange) is exercised in isolation.
vi.mock('../JqlAutocomplete', () => ({
  JqlAutocomplete: React.forwardRef<HTMLInputElement, any>(({ value, onChange, placeholder }: any, ref) => (
    <input
      ref={ref}
      data-testid="jql-input"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )),
}));

// Inline-render the Radix primitives so options/dialog actions are always
// present in the DOM (no pointer-event/portal juggling under jsdom).
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children, ...rest }: any) => (
    <div data-testid="popover-content" {...rest}>{children}</div>
  ),
}));
vi.mock('@/components/ui/alert-dialog', () => {
  const Passthrough = ({ children }: any) => <>{children}</>;
  return {
    AlertDialog: ({ children }: any) => <div data-testid="alert-dialog">{children}</div>,
    AlertDialogTrigger: ({ children }: any) => <>{children}</>,
    AlertDialogContent: ({ children }: any) => <div data-testid="alert-dialog-content">{children}</div>,
    AlertDialogHeader: Passthrough,
    AlertDialogTitle: Passthrough,
    AlertDialogDescription: Passthrough,
    AlertDialogFooter: Passthrough,
    AlertDialogCancel: ({ children, onClick }: any) => (
      <button type="button" onClick={onClick}>{children}</button>
    ),
    AlertDialogAction: ({ children, onClick, className }: any) => (
      <button type="button" onClick={onClick} className={className}>{children}</button>
    ),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// localConfig: only getCustomExtractFields is read by the panel.
let localConfigMock: any;
vi.mock('@/lib/config/local-store', () => ({
  get localConfig() {
    return localConfigMock;
  },
}));

function buildJqlFilters(overrides: Partial<UseJqlFiltersResult> = {}): UseJqlFiltersResult {
  return {
    jqlList: [],
    stagingFilters: {},
    addJql: vi.fn(),
    editJql: vi.fn(),
    deleteJql: vi.fn(),
    toggleStagingFilter: vi.fn(),
    clearStagingFilters: vi.fn(),
    applyStagingFilters: vi.fn(() => ({})),
    ...overrides,
  } as unknown as UseJqlFiltersResult;
}

function buildProps(overrides: Record<string, any> = {}) {
  const jqlFilters = buildJqlFilters(overrides.jqlFilters);
  return {
    jqlFilters,
    filterOptions: { status: ['Open', 'Done'], priority: ['High', 'Low'] },
    globalFilters: {},
    setGlobalFilters: vi.fn(),
    jqlQuery: '',
    setJqlQuery: vi.fn(),
    jqlInputRef: { current: null },
    editingJqlId: null,
    setEditingJqlId: vi.fn(),
    jqlToDelete: null,
    setJqlToDelete: vi.fn(),
    setIsViewModified: vi.fn(),
    handleApplyFilters: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localConfigMock = { getCustomExtractFields: vi.fn(() => []) };
});

describe('KpiFilterPanel', () => {
  it('renders the panel shell (heading, Clear All, Apply Filters)', () => {
    renderWithProviders(<KpiFilterPanel {...buildProps()} />);

    expect(screen.getByText('Advanced Filtering')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply filters/i })).toBeInTheDocument();
  });

  it('reflects the JQL input value and shows the "Dynamic Filter Active" badge', () => {
    renderWithProviders(<KpiFilterPanel {...buildProps({ jqlQuery: 'status = Done' })} />);

    const input = screen.getByTestId('jql-input') as HTMLInputElement;
    expect(input.value).toBe('status = Done');
    expect(screen.getByText(/dynamic filter active/i)).toBeInTheDocument();
  });

  it('the "Add Filter" button saves the JQL, stages it, and marks the view modified', () => {
    const props = buildProps({ jqlQuery: 'status = Done' });
    renderWithProviders(<KpiFilterPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /add filter/i }));

    expect(props.jqlFilters.addJql).toHaveBeenCalledWith('status = Done', 'status = Done');
    expect(props.jqlFilters.toggleStagingFilter).toHaveBeenCalledWith('jql', 'status = Done');
    expect(props.setIsViewModified).toHaveBeenCalledWith(true);
    expect(props.setJqlQuery).toHaveBeenCalledWith('');
  });

  it('the "Update Filter" button edits an existing JQL by id', () => {
    const jqlFilters = buildJqlFilters({
      jqlList: [{ id: 'j1', query: 'status = Done', name: 'My JQL' } as any],
    });
    const props = buildProps({ jqlFilters, editingJqlId: 'j1', jqlQuery: 'status = Open' });
    renderWithProviders(<KpiFilterPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /update filter/i }));

    expect(jqlFilters.editJql).toHaveBeenCalledWith('j1', 'status = Open', 'My JQL');
    expect(props.setEditingJqlId).toHaveBeenCalledWith(null);
    expect(props.setJqlQuery).toHaveBeenCalledWith('');
  });

  it('the Cancel button resets the editing state', () => {
    const props = buildProps({ editingJqlId: 'j1', jqlQuery: 'status = Open' });
    renderWithProviders(<KpiFilterPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(props.setEditingJqlId).toHaveBeenCalledWith(null);
    expect(props.setJqlQuery).toHaveBeenCalledWith('');
  });

  it('renders saved JQL chips and toggles one when clicked', () => {
    const jqlFilters = buildJqlFilters({
      jqlList: [{ id: 'j1', query: 'status = Done', name: 'My JQL' } as any],
    });
    const props = buildProps({ jqlFilters });
    renderWithProviders(<KpiFilterPanel {...props} />);

    // The chip surfaces the query text.
    const chip = screen.getByText('status = Done');
    fireEvent.click(chip);

    expect(jqlFilters.toggleStagingFilter).toHaveBeenCalledWith('jql', 'status = Done');
    expect(props.setIsViewModified).toHaveBeenCalledWith(true);
  });

  it('deletes a saved JQL via the alert action', () => {
    const jqlFilters = buildJqlFilters({
      jqlList: [{ id: 'j1', query: 'status = Done', name: 'My JQL' } as any],
    });
    const props = buildProps({ jqlFilters, jqlToDelete: 'j1' });
    renderWithProviders(<KpiFilterPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(jqlFilters.deleteJql).toHaveBeenCalledWith('j1');
    expect(props.setJqlToDelete).toHaveBeenCalledWith(null);
  });

  it('removes a staged filter value via its chip X button', () => {
    const jqlFilters = buildJqlFilters({ stagingFilters: { status: ['Open'] } });
    const props = buildProps({ jqlFilters });
    renderWithProviders(<KpiFilterPanel {...props} />);

    // The staged chip "Status: Open" with an X (lucide-x) icon.
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    const xIcon = document.querySelector('.lucide-x') as unknown as Element;
    expect(xIcon).toBeTruthy();
    fireEvent.click(xIcon);

    expect(jqlFilters.toggleStagingFilter).toHaveBeenCalledWith('status', 'Open');
    expect(props.setIsViewModified).toHaveBeenCalledWith(true);
  });

  it('toggles a dimension value from the filter popover', () => {
    const jqlFilters = buildJqlFilters();
    const props = buildProps({ jqlFilters });
    renderWithProviders(<KpiFilterPanel {...props} />);

    // Inline popover renders the Status options directly. Click "Open".
    fireEvent.click(screen.getByText('Open'));

    expect(jqlFilters.toggleStagingFilter).toHaveBeenCalledWith('status', 'Open');
    expect(props.setIsViewModified).toHaveBeenCalledWith(true);
  });

  it('disables Apply when staging matches global filters', () => {
    const jqlFilters = buildJqlFilters({ stagingFilters: { status: ['Open'] } });
    const props = buildProps({ jqlFilters, globalFilters: { status: ['Open'] } });
    renderWithProviders(<KpiFilterPanel {...props} />);

    expect(screen.getByRole('button', { name: /apply filters/i })).toBeDisabled();
  });

  it('enables Apply and calls handleApplyFilters when staging differs from global', () => {
    const jqlFilters = buildJqlFilters({ stagingFilters: { status: ['Open'] } });
    const props = buildProps({ jqlFilters, globalFilters: {} });
    renderWithProviders(<KpiFilterPanel {...props} />);

    const apply = screen.getByRole('button', { name: /apply filters/i });
    expect(apply).not.toBeDisabled();
    fireEvent.click(apply);
    expect(props.handleApplyFilters).toHaveBeenCalledTimes(1);
  });

  it('Clear All Filters resets staging and global filters', () => {
    const jqlFilters = buildJqlFilters({ stagingFilters: { status: ['Open'] } });
    const props = buildProps({ jqlFilters, globalFilters: { status: ['Open'] } });
    renderWithProviders(<KpiFilterPanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));

    expect(jqlFilters.clearStagingFilters).toHaveBeenCalled();
    expect(props.setGlobalFilters).toHaveBeenCalledWith({});
  });
});
