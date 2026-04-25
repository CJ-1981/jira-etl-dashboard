import re

with open('src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '  SelectItem,\n  SelectTrigger,',
    '  SelectItem,\n  SelectTrigger,\n  SelectGroup,\n  SelectLabel,\n  SelectSeparator,'
)

content = content.replace(
    'disabled={!hasUnsavedChanges}>\n            <Save className="mr-2 h-4 w-4" /> Save SLA Targets',
    'disabled={!hasUnsavedSettings}>\n            <Save className="mr-2 h-4 w-4" /> Save SLA Targets'
)

content = content.replace(
    'value={hours || \'\'}',
    'value={(hours as number) || \'\'}'
)

with open('src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
