import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Providers } from '@/app/providers';

/**
 * Regression for the "No QueryClient set" crash: the page component calls
 * polling/query hooks at its top level, so the QueryClientProvider must sit
 * ABOVE the page (in the layout via <Providers>), not inside the page's own
 * JSX. These tests pin the Providers contract that makes that work.
 */

function QueryProbe() {
  // Throws "No QueryClient set" if no provider is mounted above.
  const client = useQueryClient();
  return <div data-testid="probe">{client ? 'client-ok' : 'no-client'}</div>;
}

function QueryConsumer() {
  const { data, status } = useQuery<string>({
    queryKey: ['probe-query'],
    queryFn: async () => 'fetched',
    retry: false,
  });
  return <div data-testid="consumer">{status === 'pending' ? 'pending' : data}</div>;
}

describe('Providers', () => {
  it('provides a QueryClient to children (hooks do not throw)', () => {
    render(
      <Providers>
        <QueryProbe />
      </Providers>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('client-ok');
  });

  it('children can run queries through the provided client', async () => {
    render(
      <Providers>
        <QueryConsumer />
      </Providers>,
    );
    expect(await screen.findByText('fetched')).toBeDefined();
  });

  it('creates a client instance per mount (no module-level shared client)', () => {
    // A module-scope QueryClient would leak cache/state across mounts and
    // across SSR requests; per-instance creation is the documented Next.js
    // pattern.
    const seen: unknown[] = [];
    function Collector() {
      seen.push(useQueryClient());
      return null;
    }
    const first = render(
      <Providers>
        <Collector />
      </Providers>,
    );
    first.unmount();
    render(
      <Providers>
        <Collector />
      </Providers>,
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
