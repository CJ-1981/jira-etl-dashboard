/**
 * Zod Validation Schemas for API Routes
 */
import { z } from 'zod';

/**
 * Common validation schemas
 */
export const IdSchema = z.string().cuid();

export const NameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters')
  .regex(/^[a-zA-Z0-9\s\-_\.]+$/, 'Name contains invalid characters');

export const UrlSchema = z.string()
  .min(1, 'URL is required')
  .transform(val => val.trim()) // Trim whitespace
  .refine(val => {
    try {
      // Handle URLs without protocol
      let urlToCheck = val;
      if (!val.match(/^https?:\/\//i)) {
        urlToCheck = `https://${val}`;
      }
      const parsed = new URL(urlToCheck);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, 'Invalid URL format. URL must be a valid web address (e.g., https://your-domain.com)');

export const EmailSchema = z.string()
  .min(1, 'Email is required')
  .email('Invalid email format');

export const PasswordSchema = z.string()
  .min(1, 'Password is required')
  .max(255, 'Password is too long'); // Simplified - just check it's not empty and not too long

/**
 * Jira Connection schemas
 */
export const JiraConnectionCreateSchema = z.object({
  name: NameSchema,
  baseUrl: UrlSchema,
  apiToken: z.string()
    .min(1, 'API token is required')
    .max(255, 'API token is too long'), // Increased from 100 to 255 characters
  email: EmailSchema,
  projectKeys: z.union([
    z.string(),
    z.array(z.string())
  ]).optional().default('').transform(val => {
    if (!val) return [];
    return Array.isArray(val) ? val : val.split(',').map(k => k.trim()).filter(Boolean);
  })
});

export const JiraConnectionUpdateSchema = JiraConnectionCreateSchema.partial();

/**
 * PostgreSQL Connection schemas
 */
export const PostgresConnectionCreateSchema = z.object({
  name: NameSchema,
  host: z.string()
    .min(1, 'Host is required')
    .max(255, 'Host must be less than 255 characters')
    .refine(val => !val.includes(' '), 'Host cannot contain spaces'),
  port: z.number()
    .int('Port must be an integer')
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535')
    .default(5432),
  database: z.string()
    .min(1, 'Database name is required')
    .max(100, 'Database name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Database name contains invalid characters'),
  username: z.string()
    .min(1, 'Username is required')
    .max(100, 'Username must be less than 100 characters'),
  password: PasswordSchema,
  sslMode: z.enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full'])
    .default('prefer'),
  schemaName: z.string()
    .regex(/^[a-zA-Z0-9_]+$/, 'Schema name contains invalid characters')
    .default('public'),
  tableName: z.string()
    .regex(/^[a-zA-Z0-9_]+$/, 'Table name contains invalid characters')
    .default('jira_kpi_results')
});

// Schema for updating PostgreSQL connections (password is optional)
export const PostgresConnectionUpdateSchema = z.object({
  name: NameSchema.optional(),
  host: z.string()
    .min(1, 'Host is required')
    .max(255, 'Host must be less than 255 characters')
    .refine(val => !val.includes(' '), 'Host cannot contain spaces')
    .optional(),
  port: z.number()
    .int('Port must be an integer')
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535')
    .optional(),
  database: z.string()
    .min(1, 'Database name is required')
    .max(100, 'Database name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Database name contains invalid characters')
    .optional(),
  username: z.string()
    .min(1, 'Username is required')
    .max(100, 'Username must be less than 100 characters')
    .optional(),
  password: z.string().max(255, 'Password too long').optional(), // Optional for updates
  sslMode: z.enum(['disable', 'prefer', 'require', 'verify-ca', 'verify-full']).optional(),
  schemaName: z.string()
    .regex(/^[a-zA-Z0-9_]+$/, 'Schema name contains invalid characters')
    .optional(),
  tableName: z.string()
    .regex(/^[a-zA-Z0-9_]+$/, 'Table name contains invalid characters')
    .optional(),
}).partial(); // Make all fields optional for partial updates

/**
 * Metabase Connection schemas
 */
export const MetabaseConnectionCreateSchema = z.object({
  name: NameSchema,
  baseUrl: UrlSchema,
  username: z.string()
    .min(1, 'Username is required')
    .max(100, 'Username must be less than 100 characters'),
  password: PasswordSchema,
  apiKey: z.string().optional()
});

/**
 * ETL Pipeline schemas
 */
export const EtlPipelineCreateSchema = z.object({
  name: NameSchema,
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),
  jiraConnectionId: IdSchema,
  schedule: z.string()
    .regex(/^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/[0-9]+)\s+(\*|([0-9]|1[0-9]|2[0-3])|\*\/[0-9]+)\s+(\*|([1-9]|[12][0-9]|3[01])|\*\/[0-9]+)\s+(\*|([1-9]|1[0-2])|\*\/[0-9]+)\s+(\*|([0-6])|\*\/[0-9]+)$/,
      'Invalid cron expression')
    .optional(),
  enabled: z.boolean().default(true)
});

/**
 * Jira Extract schemas
 */
export const JiraExtractSchema = z.object({
  connectionId: IdSchema,
  jql: z.string()
    .min(1, 'JQL query is required')
    .max(1000, 'JQL query must be less than 1000 characters')
    .optional(),
  daysAgo: z.number()
    .int('Days must be an integer')
    .min(1, 'Days must be at least 1')
    .max(365, 'Days cannot exceed 365')
    .optional(),
  quickPull: z.enum(['7d', '30d', '90d', '365d']).optional(),
  maxResults: z.number()
    .int('Max results must be an integer')
    .min(1, 'Max results must be at least 1')
    .max(10000, 'Max results cannot exceed 10000')
    .default(1000)
});

/**
 * KPI Calculation schemas
 */
export const KpiCalculateSchema = z.object({
  etlRunId: IdSchema.optional(),
  kpiIds: z.array(IdSchema).optional(),
  forceRecalculate: z.boolean().default(false)
});

/**
 * Settings schemas
 */
export const SettingsUpdateSchema = z.object({
  rateLimit: z.object({
    delay: z.number().min(0).max(10000).default(1000),
    maxRpm: z.number().min(1).max(1000).default(60),
    batchSize: z.number().min(1).max(1000).default(50),
    backoffStrategy: z.enum(['none', 'linear', 'exponential']).default('none')
  }).optional(),
  general: z.object({
    defaultHolidayState: z.enum(['national', 'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH']).default('national'),
    workHours: z.object({
      start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').default('09:00'),
      end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').default('17:00')
    }),
    slaTarget: z.number().min(1).max(240).default(24)
  }).optional()
});

/**
 * Query parameter schemas
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

export const IdQuerySchema = z.object({
  id: IdSchema
});

/**
 * Helper function to validate request body
 */
export async function validateBody<T>(schema: z.ZodSchema<T>, request: Request): Promise<T> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new Error('Invalid JSON body');
  }
}

/**
 * Helper function to validate query parameters
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): T {
  const params = Object.fromEntries(searchParams.entries());
  return schema.parse(params);
}

/**
 * Helper function to validate both body and query
 */
export async function validateRequest<TBody, TQuery>(
  bodySchema: z.ZodSchema<TBody>,
  querySchema: z.ZodSchema<TQuery>,
  request: Request
): Promise<{ body: TBody; query: TQuery }> {
  try {
    const [body, url] = await Promise.all([
      request.json(),
      new URL(request.url)
    ]);

    const validatedBody = bodySchema.parse(body);
    const validatedQuery = querySchema.parse(Object.fromEntries(url.searchParams.entries()));

    return { body: validatedBody, query: validatedQuery };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw error;
    }
    throw new Error('Invalid request data');
  }
}