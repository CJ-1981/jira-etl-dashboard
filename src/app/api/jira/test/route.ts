import { NextResponse } from 'next/server';
import { JiraClient } from '@/lib/jira/client';
import { handleApiError, ValidationError } from '@/lib/api-error';
import { UrlSchema, EmailSchema } from '@/lib/validation/schemas';
import { log } from '@/lib/logger';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { baseUrl, email, apiToken } = body;

    if (!baseUrl || !email || !apiToken) {
      throw new ValidationError('baseUrl, email, and apiToken are required');
    }

    log.info('Testing Jira connection', 'POST /api/jira/test', {
      baseUrl: baseUrl.trim(),
      email
    });

    // JiraClient will automatically normalize the URL
    const client = new JiraClient({
      baseUrl: baseUrl.trim(),
      email: email.trim(),
      apiToken: apiToken.trim(),
      projectKeys: [],
    });

    const result = await client.testConnection();
    const responseTime = Date.now() - startTime;
    // Get the normalized baseUrl from the client
    const normalizedBaseUrl = (client as any).config.baseUrl;

    if (result.success) {
      log.info('Jira connection test successful', 'POST /api/jira/test', {
        responseTime: `${responseTime}ms`,
        serverInfo: result.serverInfo
      });

      return NextResponse.json({
        success: true,
        message: 'Connection successful!',
        serverInfo: result.serverInfo,
        diagnostics: {
          responseTime: `${responseTime}ms`,
          baseUrl: normalizedBaseUrl,
          originalUrl: baseUrl.trim(),
          timestamp: new Date().toISOString()
        }
      }, { status: 200 });
    } else {
      log.error('Jira connection test failed', 'POST /api/jira/test', new Error(result.error), {
        responseTime: `${responseTime}ms`,
        baseUrl: normalizedBaseUrl
      });

      return NextResponse.json({
        success: false,
        message: 'Connection failed',
        error: result.error,
        diagnostics: {
          responseTime: `${responseTime}ms`,
          baseUrl: normalizedBaseUrl,
          originalUrl: baseUrl.trim(),
          email,
          timestamp: new Date().toISOString(),
          suggestions: getSuggestions(result.error)
        }
      }, { status: 400 });  // Return 400 for connection failures
    }
  } catch (error) {
    log.error('Jira connection test error', 'POST /api/jira/test', error as Error);
    return handleApiError(error);
  }
}

/**
 * Provide helpful suggestions based on error type
 */
function getSuggestions(error?: string): string[] {
  if (!error) return [];

  const suggestions: string[] = [];

  if (error.includes('401') || error.includes('403')) {
    suggestions.push('Check that your email and API token are correct');
    suggestions.push('Make sure your API token has not expired');
    suggestions.push('Verify your Jira account permissions');
  } else if (error.includes('404')) {
    suggestions.push('Check that the base URL is correct');
    suggestions.push('Make sure you are using the full URL (e.g., https://yourdomain.atlassian.net)');
    suggestions.push('Verify your Jira instance is accessible');
  } else if (error.includes('ENOTFOUND') || error.includes('ECONNREFUSED')) {
    suggestions.push('Check your internet connection');
    suggestions.push('Verify the base URL is correct and accessible');
    suggestions.push('Make sure your Jira instance is running');
  } else if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
    suggestions.push('Connection timed out - your Jira instance may be slow');
    suggestions.push('Check your network connection');
    suggestions.push('Try again later');
  }

  return suggestions;
}
