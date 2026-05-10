# Custom Plugins Directory

This directory is for user-defined KPI plugins.

## Adding Custom Plugins

1. Create a new TypeScript file in this directory
2. Import the KpiPlugin interface from `../../types.ts`
3. Implement the plugin interface
4. Export as default

## Example Template

```typescript
import { KpiPlugin, KpiContext, KpiResult } from '../../types';

const myCustomPlugin: KpiPlugin = {
  id: 'my-custom-metric',
  name: 'My Custom Metric',
  category: 'custom',
  domain: 'custom',
  version: '1.0.0',
  
  calculate: (context: KpiContext): KpiResult => {
    // Your calculation logic here
    return {
      name: 'Custom Metric',
      value: 42,
      unit: 'count',
      ticketKeys: context.issues.map(i => i.key),
    };
  },
  
  metadata: {
    description: 'Description of what this metric calculates',
    author: 'Your Name',
    tags: ['custom', 'specific-domain'],
  },
};

export default myCustomPlugin;
```

## Best Practices

- Use kebab-case for plugin IDs
- Include comprehensive metadata
- Handle edge cases (empty data, missing fields)
- Return meaningful units and descriptions
- Include ticketKeys for traceability
- Add examples in metadata

## Discovery

Custom plugins in this directory are automatically discovered and loaded by the plugin loader. No manual registration required.
