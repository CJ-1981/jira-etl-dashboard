/**
 * DataSource factory — picks the implementation from the build mode.
 *
 * The mode is baked at build time (see lib/runtime/mode.ts), so this is a
 * constant per deployed bundle: server/exe builds always get
 * ServerDataSource, the static GitHub Pages build always gets
 * RelayDataSource.
 */

import { getAppMode } from '@/lib/runtime/mode';
import type { DataSource } from './types';
import { ServerDataSource } from './server';
import { RelayDataSource } from './relay';

export function getDataSource(): DataSource {
  return getAppMode() === 'relay' ? relayDataSource : serverDataSource;
}

const serverDataSource = new ServerDataSource();
const relayDataSource = new RelayDataSource();

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
