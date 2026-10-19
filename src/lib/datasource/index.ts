/**
 * DataSource factory — picks the implementation from the build mode.
 *
 * The mode is baked at build time (see lib/runtime/mode.ts), so this is a
 * constant per deployed bundle: server/exe builds always get
 * ServerDataSource, the static GitHub Pages build always gets
 * RelayDataSource.
 *
 * Demo mode (user toggle, see local-config cfg_demo_mode) wraps whichever
 * backend is active in a DemoDataSource that serves artificial data — no
 * Jira credentials or database writes involved.
 */

import { getAppMode } from '@/lib/runtime/mode';
import { localConfig } from '@/lib/config/local-store';
import type { DataSource } from './types';
import { ServerDataSource } from './server';
import { RelayDataSource } from './relay';
import { DemoDataSource } from './demo';

export function getDataSource(): DataSource {
  if (localConfig.getDemoMode()) return demoDataSource;
  return getAppMode() === 'relay' ? relayDataSource : serverDataSource;
}

const serverDataSource = new ServerDataSource();
const relayDataSource = new RelayDataSource();
const demoDataSource = new DemoDataSource(
  getAppMode() === 'relay' ? relayDataSource : serverDataSource
);

export type {
  CalcParams,
  CalcResult,
  DataSource,
  ExportFileParams,
  ExtractParams,
  ExtractResult,
  ExtractSummary,
  HolidaysResult,
  MasterDatasetData,
  PluginInfo,
  TestConnectionResult,
  ViewInput,
  ViewPatch,
} from './types';
