/**
 * KPI Plugin Watcher Service
 * Monitors the custom plugins directory for changes and triggers reloads
 * @MX:ANCHOR: Plugin hot-reload service
 * @MX:REASON: Enables real-time plugin updates without server restart
 */

import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import path from 'path';
import { EventEmitter } from 'events';

export interface PluginChangeEvent {
  type: 'add' | 'change' | 'unlink';
  pluginId?: string;
  filePath: string;
}

class PluginWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private customDir: string;
  private isWatching = false;
  private eventCounter = 0;

  constructor() {
    super();
    this.customDir = path.join(process.cwd(), 'src', 'lib', 'kpi', 'plugins', 'custom');
  }

  /**
   * Get the current event counter value
   */
  getEventCounter(): number {
    return this.eventCounter;
  }

  /**
   * Start watching the custom plugins directory
   */
  start() {
    if (this.isWatching) {
      console.log('[PluginWatcher] Already watching');
      return;
    }

    console.log('[PluginWatcher] Starting to watch:', this.customDir);

    this.watcher = chokidar.watch(this.customDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // Don't trigger events for existing files on start
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1 second after file write before triggering event
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath: string) => {
        this.eventCounter++;
        this.handleFileChange('add', filePath);
      })
      .on('change', (filePath: string) => {
        this.eventCounter++;
        this.handleFileChange('change', filePath);
      })
      .on('unlink', (filePath: string) => {
        this.eventCounter++;
        this.handleFileChange('unlink', filePath);
      })
      .on('error', (error: unknown) => console.error('[PluginWatcher] Error:', error))
      .on('ready', () => {
        this.isWatching = true;
        console.log('[PluginWatcher] Ready to watch for changes');
      });
  }

  /**
   * Stop watching the custom plugins directory
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      console.log('[PluginWatcher] Stopped watching');
    }
  }

  /**
   * Handle file changes
   */
  private handleFileChange(type: 'add' | 'change' | 'unlink', filePath: string) {
    console.log(`[PluginWatcher] File ${type}:`, filePath);

    // Extract plugin ID from file path
    const relativePath = path.relative(this.customDir, filePath);
    const pluginId = this.extractPluginId(relativePath);

    const event: PluginChangeEvent = {
      type,
      pluginId,
      filePath,
    };

    // Emit the change event
    this.emit('change', event);

    // Also emit specific events for each type
    this.emit(type, event);
  }

  /**
   * Extract plugin ID from file path
   */
  private extractPluginId(relativePath: string): string | undefined {
    // Remove file extension and convert to kebab-case
    const parts = relativePath.split(path.sep);
    const fileName = parts[parts.length - 1];
    if (fileName) {
      return fileName.replace(/\.(ts|js|tsx|jsx)$/, '');
    }
    return undefined;
  }

  /**
   * Check if currently watching
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

// Singleton instance
let pluginWatcherInstance: PluginWatcher | null = null;

/**
 * Get the singleton plugin watcher instance
 */
export function getPluginWatcher(): PluginWatcher {
  if (!pluginWatcherInstance) {
    pluginWatcherInstance = new PluginWatcher();
  }
  return pluginWatcherInstance;
}
