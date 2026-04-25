import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update PluginsPanel usage
content = content.replace(
    '<PluginsPanel />',
    '<PluginsPanel settings={settings} onSettingsUpdate={handleSettingsUpdate} />'
)

# 2. Update PluginsPanel definition
plugins_panel_def_old = '''function PluginsPanel() {
  const [plugins, setPlugins] = useState<Record<string, KpiPlugin[]>>({});'''

plugins_panel_def_new = '''function PluginsPanel({ settings: globalSettings, onSettingsUpdate }: { settings?: any, onSettingsUpdate?: (settings: any) => void }) {
  const [plugins, setPlugins] = useState<Record<string, KpiPlugin[]>>({});
  const [settings, setSettings] = useState<any>(globalSettings || localConfig.getSettings());
  const [initialSettings, setInitialSettings] = useState<any>(globalSettings || localConfig.getSettings());
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false);

  React.useEffect(() => {
    if (globalSettings) {
      setSettings(globalSettings);
      setInitialSettings(globalSettings);
      setHasUnsavedSettings(false);
    }
  }, [globalSettings]);

  React.useEffect(() => {
    if (initialSettings && settings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(initialSettings);
      setHasUnsavedSettings(changed);
    }
  }, [settings, initialSettings]);'''
content = content.replace(plugins_panel_def_old, plugins_panel_def_new)

# 3. Extract SLA targets by status
sla_start = content.find('      {/* SLA Targets by Status */}')
sla_end = content.find('      {/* General Settings & Rate Limiting - Combined */}')
sla_block = content[sla_start:sla_end]
content = content[:sla_start] + content[sla_end:]

# 4. Extract KPI Calculation Defaults
kpi_start = content.find('          {/* General Settings Section */}')
kpi_end = content.find('          {/* Save Button */}')
kpi_block = content[kpi_start:kpi_end]
content = content[:kpi_start] + content[kpi_end:]

# Fix KPI block to be a standalone Card since it's being moved out of the general settings card
# Adjust indentations too! kpi_block is indented at 10 spaces.
kpi_card_block = f'''
      {{/* KPI Calculation Defaults */}}
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-blue-400" /> KPI Calculation Defaults</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">Configure default values for KPI calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
{kpi_block[4:]}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button onClick={{() => {{
              localConfig.saveSettings(settings);
              setInitialSettings(settings);
              setHasUnsavedSettings(false);
              if (onSettingsUpdate) onSettingsUpdate(settings);
              toast.success('KPI Defaults saved');
            }}}} className="bg-blue-600 hover:bg-blue-700" disabled={{!hasUnsavedSettings}}>
              <Save className="mr-2 h-4 w-4" /> Save KPI Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
'''

# Adjust hasUnsavedChanges -> hasUnsavedSettings in sla_block
sla_block = sla_block.replace('hasUnsavedChanges', 'hasUnsavedSettings')

# 5. Insert blocks at the end of PluginsPanel
search_str = '''      </div>
    </div>
  );
}

// ─── Holidays Panel'''

replace_str = f'''      </div>
{sla_block}
{kpi_card_block}
    </div>
  );
}}

// ─── Holidays Panel'''

content = content.replace(search_str, replace_str)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
