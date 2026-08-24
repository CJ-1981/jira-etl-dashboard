'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Client-side providers, mounted in the root layout so EVERY page/component
 * hook (including page-level polling hooks) sits below them.
 *
 * @MX:WARN: The QueryClient is created per component instance via useState.
 * @MX:REASON: A module-scope client would be shared across SSR requests and
 * across mounts, leaking cache state. This is the documented Next.js +
 * TanStack Query pattern. Moving the provider INTO a page's own JSX breaks
 * hooks called by that same page (context only flows to descendants) — that
 * regression caused the "No QueryClient set" crash fixed here.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Dashboard data is user-triggered; avoid surprise background
            // refetch storms on tab focus (polling queries manage their own
            // cadence via refetchInterval).
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
