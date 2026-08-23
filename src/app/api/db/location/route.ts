import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';

function fileUrlToPath(url: string): string {
  let p = url.replace(/^file:(\/\/)?/, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    // keep raw value if it is not a valid URI component
  }
  return p;
}

/**
 * Reports where the default (Local SQLite) database lives.
 * Mirrors the resolution order used by getDb() for the default sqlite config:
 * DATABASE_URL from the environment (set by the launcher in packaged builds),
 * otherwise the relative dev default.
 */
export async function GET() {
  try {
    const envUrl = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
    const url = envUrl || 'file:./db/custom.db';
    // Absolute = starts with "/", or a Windows drive letter followed by "/" or "\".
    // Accepts both separators since DATABASE_URL may legitimately use either on Windows.
    const relative = !/^([a-zA-Z]:)?[\\/]/.test(fileUrlToPath(url));

    return NextResponse.json({
      success: true,
      url,
      path: relative ? null : fileUrlToPath(url),
      relative,
      hint: relative
        ? 'Development mode: resolved relative to the Prisma schema (prisma/db/custom.db)'
        : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
