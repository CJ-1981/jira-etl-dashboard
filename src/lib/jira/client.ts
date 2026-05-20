/**
 * Jira REST API Client
 * Handles extraction of issues, transitions, and metadata from Jira Cloud/Server.
 */

export interface JiraConnectionConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKeys: string[];
}

export interface JiraIssue {
  key: string;
  self: string;
  fields: {
    summary: string;
    issuetype: { name: string };
    priority?: { name: string };
    status: { name: string; statusCategory: { name: string } };
    assignee?: { displayName: string; emailAddress: string };
    reporter?: { displayName: string; emailAddress: string };
    created: string;
    updated: string;
    resolutiondate?: string;
    duedate?: string;
    customfield_10002?: number; // Story Points (varies by instance)
    customfield_10132?: string | { value: string; id: string; self: string }; // Issue Owner Team (LTIC) - select field returns object
    labels?: string[];
    components?: { name: string }[];
  };
  changelog?: {
    histories: JiraChangelogEntry[];
  };
}

export interface JiraChangelogEntry {
  id: string;
  author: { displayName: string };
  created: string;
  items: JiraChangelogItem[];
}

export interface JiraChangelogItem {
  field: string;
  fieldtype: string;
  from: string;
  fromString?: string;
  to: string;
  toString?: string;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total?: number;
  maxResults?: number;
  startAt?: number;
  nextPageToken?: string;
  isLast?: boolean;
}

export interface JiraFieldMapping {
  storyPointsField: string;
  issueOwnerTeamField: string;
  sprintField: string;
  epicLinkField: string;
}

export class JiraClient {
  private config: JiraConnectionConfig;
  private fieldMapping: Required<JiraFieldMapping>;

  constructor(config: JiraConnectionConfig, fieldMapping?: Partial<JiraFieldMapping>) {
    // Normalize baseUrl: ensure it has a protocol
    let normalizedBaseUrl = config.baseUrl.trim();
    if (!normalizedBaseUrl.match(/^https?:\/\//i)) {
      normalizedBaseUrl = `https://${normalizedBaseUrl}`;
    }
    // Remove trailing slash
    normalizedBaseUrl = normalizedBaseUrl.replace(/\/$/, '');

    this.config = {
      ...config,
      baseUrl: normalizedBaseUrl
    };
    this.fieldMapping = {
      storyPointsField: fieldMapping?.storyPointsField || 'customfield_10002',
      issueOwnerTeamField: fieldMapping?.issueOwnerTeamField || 'customfield_10132',
      sprintField: fieldMapping?.sprintField || 'customfield_10020',
      epicLinkField: fieldMapping?.epicLinkField || 'customfield_10014',
    };
  }

  private getHeaders(): HeadersInit {
    const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    return {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private buildUrl(path: string): string {
    // baseUrl is already normalized in constructor
    return `${this.config.baseUrl}/rest/api/3${path}`;
  }

  /**
   * Test connection to Jira instance
   * Verifies credentials by checking the current user (requires valid authentication)
   */
  async testConnection(): Promise<{ success: boolean; serverInfo?: Record<string, unknown>; error?: string }> {
    try {
      // Step 1: Check serverInfo (basic connectivity)
      const serverResponse = await fetch(this.buildUrl('/serverInfo'), {
        headers: this.getHeaders(),
      });

      if (!serverResponse.ok) {
        return { success: false, error: `Server unavailable (HTTP ${serverResponse.status}: ${serverResponse.statusText})` };
      }

      const serverData = await serverResponse.json();

      // Step 2: Verify authentication by fetching current user
      // This endpoint REQUIRES valid credentials - will fail with 401/403 for bad tokens
      const userResponse = await fetch(this.buildUrl('/myself'), {
        headers: this.getHeaders(),
      });

      if (!userResponse.ok) {
        if (userResponse.status === 401) {
          return { success: false, error: 'Authentication failed (401). Your API token is invalid or expired.' };
        }
        if (userResponse.status === 403) {
          return { success: false, error: 'Access denied (403). Your API token does not have permission to access this Jira instance.' };
        }
        // Don't fail the entire test if /myself fails - some Jira instances restrict this endpoint
        console.warn(`/myself endpoint returned ${userResponse.status}, but continuing with test`);
      }

      // Step 3: Verify we can actually search issues (required for extraction)
      // Use a JQL that should return 0 results but proves search works
      const searchResponse = await fetch(this.buildUrl('/search'), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          jql: 'key = "NONEXISTENT-123"',
          maxResults: 1,
          fields: ['key']
        }),
      });

      if (!searchResponse.ok) {
        if (searchResponse.status === 401 || searchResponse.status === 403) {
          return { success: false, error: `Search permission denied (HTTP ${searchResponse.status}). Your API token may not have browse permissions.` };
        }
        // Log the issue but don't fail - search endpoint might have different requirements
        console.warn(`/search endpoint returned ${searchResponse.status}, but serverInfo was successful`);
      }

      return { success: true, serverInfo: serverData };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown connection error',
      };
    }
  }

  /**
   * Get all available projects
   */
  async getProjects(): Promise<Array<{ key: string; name: string; style?: string }>> {
    const response = await fetch(this.buildUrl('/project'), {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data.map((p: Record<string, string>) => ({
      key: p.key,
      name: p.name,
      style: p.style,
    }));
  }

  /**
   * Get available fields (for field mapping configuration)
   */
  async getFields(): Promise<Array<{ id: string; name: string; custom: boolean }>> {
    const response = await fetch(this.buildUrl('/field'), {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch fields: ${response.statusText}`);
    }

    const data = await response.json();
    return data.map((f: Record<string, string | boolean>) => ({
      id: String(f.id),
      name: String(f.name),
      custom: Boolean(f.custom),
    }));
  }

  /**
   * Discover custom fields available in the Jira instance for a given JQL context.
   *
   * Strategy:
   *   1. Run the user's JQL (maxResults=1, expand=names) — the `names` dict maps every
   *      field ID that appears on that ticket to its human-readable label.
   *   2. Filter to only `customfield_*` entries.
   *   3. If JQL returns 0 results, fall back to GET /field and return all custom fields.
   */
  async discoverCustomFields(
    jql: string
  ): Promise<Array<{ fieldId: string; name: string; type: string }>> {
    // Step 1 — try to get names from a real ticket in context
    if (jql.trim()) {
      try {
        const searchBody = {
          jql: jql.trim(),
          maxResults: 1,
          fields: ['*all'],
          expand: ['names'],
        };
        const searchRes = await fetch(this.buildUrl('/search'), {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(searchBody),
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const names: Record<string, string> = searchData.names || {};
          const customEntries = Object.entries(names).filter(([id]) => id.startsWith('customfield_'));

          if (customEntries.length > 0) {
            // Get schema info to include field type (best-effort)
            const schemaMap: Record<string, string> = {};
            if (searchData.issues?.[0]?.fields) {
              // Types aren't in names; derive from schema in response if present
            }
            return customEntries.map(([fieldId, name]) => ({
              fieldId,
              name,
              type: schemaMap[fieldId] || 'custom',
            }));
          }
        }
      } catch (_) {
        // fall through to fallback
      }
    }

    // Step 2 — fallback: GET /field filtered to custom fields
    const fieldsRes = await fetch(this.buildUrl('/field'), {
      headers: this.getHeaders(),
    });

    if (!fieldsRes.ok) {
      throw new Error(`Failed to fetch field list: ${fieldsRes.status} ${fieldsRes.statusText}`);
    }

    const allFields: Array<{ id: string; name: string; custom: boolean; schema?: { type: string } }> =
      await fieldsRes.json();

    return allFields
      .filter(f => f.custom && f.id.startsWith('customfield_'))
      .map(f => ({
        fieldId: f.id,
        name: f.name,
        type: f.schema?.type || 'custom',
      }));
  }

  /**
   * Get a single issue by key (for testing access to specific issues)
   */
  async getIssue(issueKey: string): Promise<JiraIssue | null> {
    try {
      const response = await fetch(this.buildUrl(`/issue/${issueKey}`), {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.warn(`[JiraClient] Failed to fetch issue ${issueKey}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return data as JiraIssue;
    } catch (error) {
      console.error(`[JiraClient] Error fetching issue ${issueKey}:`, error);
      return null;
    }
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle rate limiting / backoff based on strategy
   */
  private async handleBackoff(attempt: number, strategy: string): Promise<void> {
    if (strategy === 'none') return;
    if (strategy === 'linear') {
      await this.sleep(1000 * attempt);
    } else if (strategy === 'exponential') {
      await this.sleep(1000 * Math.pow(2, attempt));
    }
  }

  /**
   * Execute fetch with timeout and retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    timeoutMs: number = 60000
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Fail fast on authentication errors - don't retry these
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed (HTTP ${response.status}). Please check your API token.`);
        }

        // Handle rate limiting
        if (response.status === 429) {
          if (attempt < maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
            console.warn(`Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
            await this.sleep(waitTime);
            continue;
          }
        }

        // Retry on server errors (5xx) and network errors
        if (response.status >= 500 || response.status === 0) {
          if (attempt < maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s
            console.warn(`Server error ${response.status}. Retrying ${attempt + 1}/${maxRetries} after ${waitTime}ms`);
            await this.sleep(waitTime);
            continue;
          }
        }

        return response;

      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error as Error;

        // Don't retry if it's a timeout and we've exceeded attempts
        if (lastError.name === 'AbortError' && attempt >= maxRetries) {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.warn(`Network error: ${lastError.message}. Retrying ${attempt + 1}/${maxRetries} after ${waitTime}ms`);
          await this.sleep(waitTime);
          continue;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Extract issues using JQL query with pagination and rate limiting
   */
  async extractIssues(
    jql: string,
    options: {
      maxResults?: number;
      expand?: string[];
      customFieldIds?: string[];
      onProgress?: (progress: number, total: number) => void;
      delayMs?: number;
      maxRequestsPerMinute?: number;
      backoffStrategy?: string;
    } = {}
  ): Promise<JiraIssue[]> {
    // Valid expand values for POST /rest/api/3/search/jql
    const VALID_EXPAND = new Set(['changelog', 'renderedFields', 'names', 'schema', 'operations', 'editmeta', 'versionedRepresentations']);
    const {
      maxResults = 100,
      expand = ['changelog'],
      customFieldIds = [],
      onProgress,
      delayMs = 0,
      maxRequestsPerMinute = 60,
      backoffStrategy = 'none',
    } = options;
    // Strip any unknown expand values to prevent 400 errors
    const safeExpand = expand.filter((e) => VALID_EXPAND.has(e));

    const minIntervalMs = maxRequestsPerMinute > 0 ? (60000 / maxRequestsPerMinute) : 0;
    const effectiveDelay = Math.max(delayMs, minIntervalMs);

    const allIssues: JiraIssue[] = [];
    let nextPageToken: string | null = null;
    let consecutive429Count = 0;
    let lastRequestTime = 0;
    let total = 0;

    do {
      if (effectiveDelay > 0) {
        const elapsed = Date.now() - lastRequestTime;
        if (elapsed < effectiveDelay) {
          await this.sleep(effectiveDelay - elapsed);
        }
      }

      const baseFields = ['summary', 'issuetype', 'priority', 'status', 'assignee', 'reporter',
                 'created', 'updated', 'resolutiondate', 'duedate',
                 this.fieldMapping.storyPointsField, this.fieldMapping.issueOwnerTeamField,
                 'labels', 'components', 'comment'];

      // Append user-defined custom field IDs (deduplicated)
      const allFields = [...new Set([...baseFields, ...customFieldIds])];

      const requestBody: Record<string, unknown> = {
        jql,
        maxResults,
        fields: allFields,
      };

      if (safeExpand.length > 0) {
        requestBody.expand = safeExpand.join(',');
      }
      if (nextPageToken) {
        requestBody.nextPageToken = nextPageToken;
      }

      lastRequestTime = Date.now();

      try {
        const response = await this.fetchWithRetry(
          this.buildUrl('/search/jql'),
          {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(requestBody),
          },
          3, // max retries
          60000 // 60 second timeout
        );

        consecutive429Count = 0;

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No error details available');

          // Specific error messages for authentication/permission failures
          if (response.status === 401) {
            throw new Error('Authentication failed (HTTP 401). Your API token is invalid or expired. Please check your connection settings.');
          }
          if (response.status === 403) {
            throw new Error('Access denied (HTTP 403). Your API token does not have permission to browse issues in this project.');
          }

          throw new Error(`JQL query failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: JiraSearchResult = await response.json();

        // Detailed debugging for zero results
        console.log(`[Jira API] Response: total=${data.total}, maxResults=${data.maxResults}, issues.length=${data.issues.length}`);
        if (data.total === 0) {
          console.warn(`[Jira API] No issues found for JQL: ${jql}`);
          console.warn(`[Jira API] Request body was:`, JSON.stringify(requestBody, null, 2));
          console.warn(`[Jira API] Possible causes:
  1. Project key "${this.config.projectKeys.join(', ')}" might not exist in this Jira instance
  2. No tickets created within the specified date range
  3. API token permissions differ from web UI permissions
  4. Project key case sensitivity (try uppercase/lowercase)`);
        }

        allIssues.push(...data.issues);
        total = data.total ?? total;
        nextPageToken = data.nextPageToken || null;

        onProgress?.(allIssues.length, total);

      } catch (error) {
        // Provide context about which page failed
        const pageNum = Math.floor(allIssues.length / maxResults) + 1;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        throw new Error(
          `Failed to fetch page ${pageNum} (already extracted ${allIssues.length} issues): ${errorMessage}`
        );
      }

    } while (nextPageToken);

    return allIssues;
  }

  /**
   * Build a default JQL for the configured project keys
   */
  buildDefaultJql(options: {
    dateFrom?: string;
    dateTo?: string;
    issueTypes?: string[];
    statuses?: string[];
    additional?: string;
  } = {}): string {
    const validKeys = this.config.projectKeys.filter(k => k && k.trim() !== '' && k.trim() !== '*');

    // Debug logging
    console.log(`[JiraClient] Building JQL with projectKeys:`, JSON.stringify(this.config.projectKeys));
    console.log(`[JiraClient] Filtered validKeys:`, JSON.stringify(validKeys));

    const clauses: string[] = [];
    
    if (validKeys.length > 0) {
      const projectClause = validKeys.map((key) => `project = "${key.trim()}"`).join(' OR ');
      clauses.push(`(${projectClause})`);
    }

    if (options.dateFrom) {
      // @MX:NOTE: Use both created and updated to catch all activity in the period.
      // This ensures that both new tickets and status changes on existing tickets are captured.
      clauses.push(`(created >= "${options.dateFrom}" OR updated >= "${options.dateFrom}")`);
    }
    if (options.dateTo) {
      // @MX:NOTE Jira JQL treats a bare date as midnight (00:00:00) at the START of that day,
      // so `created <= "2026-05-08"` excludes tickets created during 2026-05-08.
      // We advance dateTo by +1 day and use a strict-less-than (`<`) to form an inclusive
      // upper bound that captures the full selected day.
      const dateToObj = new Date(options.dateTo);
      // Ensure we treat the date as UTC midnight before adding a day
      const dateToExclusive = new Date(Date.UTC(dateToObj.getUTCFullYear(), dateToObj.getUTCMonth(), dateToObj.getUTCDate() + 1));
      const dateToStr = dateToExclusive.toISOString().slice(0, 10); // "YYYY-MM-DD"
      
      clauses.push(`(created < "${dateToStr}" OR updated < "${dateToStr}")`);
    }
    if (options.issueTypes?.length) {
      const typeClause = options.issueTypes.map((t) => `issuetype = "${t}"`).join(' OR ');
      clauses.push(`(${typeClause})`);
    }
    if (options.statuses?.length) {
      const statusClause = options.statuses.map((s) => `status = "${s}"`).join(' OR ');
      clauses.push(`(${statusClause})`);
    }
    if (options.additional) {
      clauses.push(options.additional);
    }

    // Separate WHERE clauses from ORDER BY clause
    const whereClause = clauses.join(' AND ');
    return whereClause ? `${whereClause} ORDER BY created DESC` : 'ORDER BY created DESC';
  }

  /**
   * Extract all issues from configured projects with full changelog
   */
  async extractAllIssues(options?: {
    dateFrom?: string;
    dateTo?: string;
    onProgress?: (progress: number, total: number) => void;
  }): Promise<JiraIssue[]> {
    const jql = this.buildDefaultJql({
      dateFrom: options?.dateFrom,
      dateTo: options?.dateTo,
    });

    return this.extractIssues(jql, {
      maxResults: 100,
      expand: ['changelog'],
      onProgress: options?.onProgress,
    });
  }
}

/**
 * Extract value from a Jira select field
 * Jira select fields return either a string or an object: { value: string, id: string, self: string }
 */
export function extractSelectFieldValue(field: string | { value: string } | undefined | null): string | null {
  if (!field) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && 'value' in field) return field.value;
  return null;
}

/**
 * Transform raw Jira issues into a flat, analysis-ready format
 */
export function transformIssue(issue: JiraIssue) {
  const transitions = extractTransitions(issue);

  // Extract Issue Owner Team value from select field object
  // @MX:NOTE: Use hardcoded customfield_10132 for Issue Owner Team (LTIC)
  // @MX:REASON: Custom Jira field that varies by instance; use REACT_APP_JIRA_ISSUE_OWNER_TEAM_FIELD env var to override
  const issueOwnerTeam = extractSelectFieldValue(issue.fields.customfield_10132);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    issueType: issue.fields.issuetype.name,
    priority: issue.fields.priority?.name || null,
    status: issue.fields.status.name,
    statusCategory: issue.fields.status.statusCategory?.name || 'Unknown',
    assignee: issue.fields.assignee?.displayName || 'Unassigned',
    reporter: issue.fields.reporter?.displayName || 'Unknown',
    issueOwnerTeam,
    created: issue.fields.created,
    updated: issue.fields.updated,
    resolved: issue.fields.resolutiondate || null,
    dueDate: issue.fields.duedate || null,
    storyPoints: (issue.fields as Record<string, unknown>)[JIRA_FIELD_MAP.storyPointsField] as number | null,
    labels: issue.fields.labels || [],
    components: issue.fields.components?.map((c) => c.name) || [],
    transitions,
    timeInStatus: calculateTimeInStatus(transitions),
  };
}

const JIRA_FIELD_MAP = {
  storyPointsField: 'customfield_10002',
  issueOwnerTeamField: 'customfield_10132', // Issue Owner Team (LTIC) - select field
};

function extractTransitions(issue: JiraIssue): Array<{
  fromStatus: string | null;
  toStatus: string;
  author: string;
  occurredAt: string;
}> {
  if (!issue.changelog?.histories) return [];

  const transitions: Array<{
    fromStatus: string | null;
    toStatus: string;
    author: string;
    occurredAt: string;
  }> = [];

  for (const history of issue.changelog.histories) {
    for (const item of history.items) {
      if (item.field === 'status') {
        transitions.push({
          fromStatus: item.fromString || null,
          toStatus: item.toString || 'Unknown',
          author: history.author.displayName,
          occurredAt: history.created,
        });
      }
    }
  }

  return transitions;
}

function calculateTimeInStatus(transitions: Array<{
  fromStatus: string | null;
  toStatus: string;
  author: string;
  occurredAt: string;
}>): Record<string, number> {
  const timeInStatus: Record<string, number> = {};

  for (let i = 0; i < transitions.length; i++) {
    const current = transitions[i];
    const nextTime = transitions[i + 1]
      ? new Date(transitions[i + 1].occurredAt).getTime()
      : Date.now();
    const currentTime = new Date(current.occurredAt).getTime();
    const durationMs = nextTime - currentTime;
    const durationHours = durationMs / (1000 * 60 * 60);

    const status = current.toStatus;
    timeInStatus[status] = (timeInStatus[status] || 0) + durationHours;
  }

  return timeInStatus;
}
