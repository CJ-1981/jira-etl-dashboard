/**
 * Metabase API Client
 *
 * Provides authenticated access to the Metabase REST API for:
 * - Session authentication (username/password) or API key auth
 * - Database discovery (list databases, get table metadata)
 * - Triggering database syncs (re-scan)
 * - Direct CSV upload to Metabase's internal data
 * - Card/Dashboard creation from pushed data
 */

export interface MetabaseConnectionConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiKey?: string | null;
}

export interface MetabaseDatabase {
  id: number;
  name: string;
  engine: string;
  details: Record<string, unknown>;
  is_full_sync: boolean;
  updated_at: string;
}

export interface MetabaseTable {
  id: number;
  name: string;
  schema: string;
  display_name: string;
  rows: number;
  updated_at: string;
}

export interface MetabaseSyncResult {
  success: boolean;
  databaseId: number;
  triggeredAt: string;
  message?: string;
}

export interface MetabaseUploadResult {
  success: boolean;
  tableId?: number;
  tableName?: string;
  rows?: number;
  error?: string;
}

/**
 * Get a valid Metabase session token
 */
export async function getMetabaseSession(
  config: MetabaseConnectionConfig
): Promise<{ sessionToken: string; error?: string }> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  try {
    const res = await fetch(`${baseUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { sessionToken: '', error: `Auth failed (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return { sessionToken: data.id || data.session_token || '' };
  } catch (error) {
    return {
      sessionToken: '',
      error: `Connection error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Make an authenticated request to Metabase API
 */
async function metabaseRequest(
  config: MetabaseConnectionConfig,
  path: string,
  options: RequestInit = {}
): Promise<{ data?: unknown; error?: string; status: number }> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/api${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Prefer API key if available, otherwise use session
  if (config.apiKey) {
    headers['X-API-Key'] = config.apiKey;
  } else {
    const { sessionToken, error } = await getMetabaseSession(config);
    if (error || !sessionToken) {
      return { error: error || 'Failed to authenticate', status: 401 };
    }
    headers['X-Metabase-Session'] = sessionToken;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const errMsg =
        typeof data === 'object' && data !== null && 'message' in data
          ? (data as { message: string }).message
          : text.slice(0, 200);
      return { error: errMsg, status: res.status };
    }

    return { data, status: res.status };
  } catch (error) {
    return {
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      status: 0,
    };
  }
}

/**
 * Test a Metabase connection
 */
export async function testMetabaseConnection(
  config: MetabaseConnectionConfig
): Promise<{
  success: boolean;
  version?: string;
  databases?: MetabaseDatabase[];
  user?: { email: string; first_name: string; last_name: string };
  error?: string;
}> {
  const { sessionToken, error: authError } = await getMetabaseSession(config);
  if (authError || !sessionToken) {
    return { success: false, error: authError };
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  try {
    const userRes = await fetch(`${baseUrl}/api/user/current`, {
      headers: { 'X-Metabase-Session': sessionToken },
    });
    const userData = await userRes.json();

    const dbRes = await fetch(`${baseUrl}/api/database`, {
      headers: { 'X-Metabase-Session': sessionToken },
    });
    const dbData = await dbRes.json();

    const databases: MetabaseDatabase[] = (dbData.data || dbData || []).map(
      (d: Record<string, unknown>) => ({
        id: d.id as number,
        name: d.name as string,
        engine: d.engine as string,
        details: (d.details || {}) as Record<string, unknown>,
        is_full_sync: (d.is_full_sync ?? true) as boolean,
        updated_at: d.updated_at as string,
      })
    );

    return {
      success: true,
      version: `Metabase ${userData.metabase_version || userData.settings?.version || 'Unknown'}`,
      databases,
      user: {
        email: userData.email || '',
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * List databases in a Metabase instance
 */
export async function listMetabaseDatabases(
  config: MetabaseConnectionConfig
): Promise<{ success: boolean; databases?: MetabaseDatabase[]; error?: string }> {
  const { data, error, status } = await metabaseRequest(config, '/database');
  if (error) return { success: false, error: `[${status}] ${error}` };

  const databases: MetabaseDatabase[] = (
    ((data as Record<string, unknown>)?.data || data || []) as Record<string, unknown>[]
  ).map((d) => ({
    id: d.id as number,
    name: d.name as string,
    engine: d.engine as string,
    details: (d.details || {}) as Record<string, unknown>,
    is_full_sync: (d.is_full_sync ?? true) as boolean,
    updated_at: d.updated_at as string,
  }));

  return { success: true, databases };
}

/**
 * List tables in a specific Metabase database
 */
export async function listMetabaseTables(
  config: MetabaseConnectionConfig,
  databaseId: number
): Promise<{ success: boolean; tables?: MetabaseTable[]; error?: string }> {
  const { data, error, status } = await metabaseRequest(
    config,
    `/database/${databaseId}/metadata?include_hidden=false`
  );
  if (error) return { success: false, error: `[${status}] ${error}` };

  const meta = data as Record<string, unknown>;
  const tables: MetabaseTable[] = (
    (meta.tables || []) as Record<string, unknown>[]
  ).map((t) => ({
    id: t.id as number,
    name: t.name as string,
    schema: (t.schema || 'public') as string,
    display_name: (t.display_name || t.name) as string,
    rows: (t.rows ?? 0) as number,
    updated_at: (t.updated_at || '') as string,
  }));

  return { success: true, tables };
}

/**
 * Trigger a Metabase database sync (re-scan / full sync)
 */
export async function triggerMetabaseSync(
  config: MetabaseConnectionConfig,
  databaseId: number,
  options: { fullSync?: boolean; scanAll?: boolean } = {}
): Promise<MetabaseSyncResult> {
  const { fullSync = false, scanAll = false } = options;

  const { error } = await metabaseRequest(config, `/database/${databaseId}/sync`, {
    method: 'POST',
    body: JSON.stringify({ ...(scanAll ? { scan_all: true } : {}) }),
  });

  if (error) {
    return {
      success: false,
      databaseId,
      triggeredAt: new Date().toISOString(),
      message: error,
    };
  }

  if (fullSync) {
    await metabaseRequest(config, `/database/${databaseId}/rescan`, {
      method: 'POST',
    });
  }

  return {
    success: true,
    databaseId,
    triggeredAt: new Date().toISOString(),
    message: `Sync triggered for database ${databaseId}${fullSync ? ' (full)' : ''}`,
  };
}

/**
 * Get sync status for a database
 */
export async function getMetabaseSyncStatus(
  config: MetabaseConnectionConfig,
  databaseId: number
): Promise<{ success: boolean; syncing?: boolean; lastSyncAt?: string; error?: string }> {
  const { data, error } = await metabaseRequest(config, `/database/${databaseId}`);
  if (error) return { success: false, error };

  const db = data as Record<string, unknown>;
  return {
    success: true,
    syncing: db.initial_sync_status === 'incomplete' || db.initial_sync_status === 'pending',
    lastSyncAt: db.updated_at as string | undefined,
  };
}

/**
 * Upload KPI data as CSV to Metabase (creates/updates a table)
 */
export async function uploadToMetabase(
  config: MetabaseConnectionConfig,
  tableName: string,
  csvData: string,
  _options: { overwrite?: boolean } = {}
): Promise<MetabaseUploadResult> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  try {
    const formData = new FormData();
    const csvBlob = new Blob([csvData], { type: 'text/csv' });
    formData.append('file', csvBlob, `${tableName}.csv`);

    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers['X-API-Key'] = config.apiKey;
    } else {
      const { sessionToken, error: authError } = await getMetabaseSession(config);
      if (authError || !sessionToken) {
        return { success: false, error: authError };
      }
      headers['X-Metabase-Session'] = sessionToken;
    }

    const uploadRes = await fetch(`${baseUrl}/api/table/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return {
        success: false,
        error: `Upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`,
      };
    }

    const uploadData = await uploadRes.json();
    const createdTables = uploadData.tables || uploadData.created_tables || [];

    return {
      success: true,
      tableId: createdTables[0]?.id,
      tableName: createdTables[0]?.name || tableName,
      rows: uploadData.row_count || createdTables[0]?.rows || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: `Upload failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Create a Metabase question (card) from a table
 */
export async function createMetabaseCard(
  config: MetabaseConnectionConfig,
  options: {
    name: string;
    databaseId: number;
    tableId: number;
    description?: string;
    visualizationType?: string;
  }
): Promise<{ success: boolean; cardId?: number; url?: string; error?: string }> {
  const {
    name,
    databaseId,
    tableId,
    description = '',
    visualizationType = 'table',
  } = options;

  const cardDef = {
    name,
    description,
    display: visualizationType,
    visualization_settings: {},
    dataset_query: {
      database: databaseId,
      type: 'query',
      query: { 'source-table': tableId },
    },
    collection_id: null,
  };

  const { data, error } = await metabaseRequest(config, '/card', {
    method: 'POST',
    body: JSON.stringify(cardDef),
  });

  if (error) return { success: false, error };

  const card = data as Record<string, unknown>;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  return {
    success: true,
    cardId: card.id as number,
    url: `${baseUrl}/question/${card.id}`,
  };
}

/**
 * Complete push flow: push CSV to Metabase + sync + optionally create a card
 */
export async function pushKpiToMetabase(
  config: MetabaseConnectionConfig,
  csvData: string,
  tableName: string,
  options: {
    syncDatabaseId?: number;
    fullSync?: boolean;
    createCard?: boolean;
    cardName?: string;
  } = {}
): Promise<{
  success: boolean;
  upload?: MetabaseUploadResult;
  sync?: MetabaseSyncResult;
  card?: { cardId?: number; url?: string; error?: string };
  error?: string;
}> {
  // Step 1: Upload CSV
  const upload = await uploadToMetabase(config, tableName, csvData);
  if (!upload.success) {
    return { success: false, upload, error: upload.error };
  }

  const result: {
    success: boolean;
    upload: MetabaseUploadResult;
    sync?: MetabaseSyncResult;
    card?: { cardId?: number; url?: string; error?: string };
    error?: string;
  } = {
    success: true,
    upload,
  };

  // Step 2: Trigger sync if database specified
  if (options.syncDatabaseId) {
    const sync = await triggerMetabaseSync(config, options.syncDatabaseId, {
      fullSync: options.fullSync,
    });
    result.sync = sync;
  }

  // Step 3: Create a card if requested
  if (options.createCard && upload.tableId) {
    const card = await createMetabaseCard(config, {
      name: options.cardName || `Jira KPI - ${tableName}`,
      databaseId: options.syncDatabaseId || 1,
      tableId: upload.tableId,
      description: 'Auto-generated from Jira ETL Dashboard',
    });
    result.card = card;
  }

  return result;
}
