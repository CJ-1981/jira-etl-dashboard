import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_select = '''              <SelectContent>
                {kpiOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>'''

new_select = '''              <SelectContent>
                {kpiOptions.timeSeries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      📈 Time-Series Trends
                    </SelectLabel>
                    {kpiOptions.timeSeries.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {kpiOptions.regular.length > 0 && (
                  <>
                    {kpiOptions.timeSeries.length > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        📊 Standard KPIs
                      </SelectLabel>
                      {kpiOptions.regular.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>'''

content = content.replace(old_select, new_select)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
