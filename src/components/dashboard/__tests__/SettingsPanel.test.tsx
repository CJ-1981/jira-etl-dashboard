import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPanel } from '../SettingsPanel';
import { localConfig } from '@/lib/config/local-store';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

const storeRef = vi.hoisted(() => ({ current: undefined as any }));

vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => {
    const s = storeRef.current;
    return typeof sel === 'function' ? sel(s) : s;
  },
}));

// SettingsPanel imports localConfig + type AppSettings + DEFAULT_SETTINGS.
vi.mock('@/lib/config/local-store', () => ({
  localConfig: {
    exportConfig: vi.fn(() => ({ exportedAt: '2026-01-01' })),
    importConfig: vi.fn(() => ({ success: true })),
    saveSettings: vi.fn(),
  },
  AppSettings: {},
  DEFAULT_SETTINGS: {
    rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
    general: { defaultHolidayState: 'all', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
    persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
    sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
    alerts: { thresholds: {} },
    webhooks: { enabled: false, url: '', secret: '' },
  },
}));

const fetchMock = vi.fn();

const DEFAULT_SETTINGS_OBJ = {
  rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
  general: { defaultHolidayState: 'all', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
  persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
  sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
  alerts: { thresholds: {} },
  webhooks: { enabled: false, url: '', secret: '' },
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeRef.current = createMockStore();
    storeRef.current.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS_OBJ));
    storeRef.current.storageConfig = { provider: 'sqlite', url: '', isCustom: false };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ success: true, views: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Configuration card and triggers /api/dashboard/views/bulk on Export', async () => {
    renderWithProviders(<SettingsPanel />);
    expect(screen.getByText('Configuration Management')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Export$/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/dashboard/views/bulk')),
    );
    expect(localConfig.exportConfig).toHaveBeenCalled();
  });

  it('toggles the webhook enable switch (id webhook-toggle)', () => {
    renderWithProviders(<SettingsPanel />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('id', 'webhook-toggle');
    fireEvent.click(toggle);
    expect(storeRef.current.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ webhooks: expect.objectContaining({ enabled: true }) }),
    );
  });

  it('updates settings when typing into the webhook secret input', () => {
    const { container } = renderWithProviders(<SettingsPanel />);
    const secretInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: 'my-secret' } });
    expect(storeRef.current.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ webhooks: expect.objectContaining({ secret: 'my-secret' }) }),
    );
  });

  it('generates a new webhook secret via the ShieldCheck button', () => {
    const { container } = renderWithProviders(<SettingsPanel />);
    const secretInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    const generateBtn = secretInput.parentElement!.querySelector('button')!;
    fireEvent.click(generateBtn);
    expect(storeRef.current.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        webhooks: expect.objectContaining({ secret: expect.any(String) }),
      }),
    );
  });

  it('saves the webhook config (Save Webhook Config calls saveSettings)', () => {
    renderWithProviders(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Save Webhook Config/i }));
    expect(localConfig.saveSettings).toHaveBeenCalled();
  });

  it('updates the rate-limit delay input', () => {
    renderWithProviders(<SettingsPanel />);
    const delayInput = screen.getByText('Delay (ms)').parentElement!.querySelector('input')!;
    fireEvent.change(delayInput, { target: { value: '100' } });
    expect(storeRef.current.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ rateLimit: expect.objectContaining({ delayMs: 100 }) }),
    );
  });

  it('saves general settings (Save Settings calls saveSettings)', () => {
    renderWithProviders(<SettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }));
    expect(localConfig.saveSettings).toHaveBeenCalled();
  });
});
