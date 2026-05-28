# Turnaround Domain

Plugins in this domain measure end-to-end cycle time and turnaround metrics.

## Metrics

- **Cycle Time** - Time from start to completion of work
- **Lead Time** - Time from request to delivery
- **Working Days** - Business days excluding holidays
- **Aging WIP** - Age of incomplete work items

## Common Use Cases

- Predicting delivery timelines
- Identifying aging work that needs attention
- Measuring process efficiency
- Capacity planning based on historical velocity

## Data Requirements

- Issue creation timestamp
- Issue resolution timestamp
- Holiday calendar for working day calculations
- Work start timestamps (if different from creation)

## Typical Dimensions

- By age buckets (0-7 days, 8-14 days, etc.)
- By priority
- By issue type
- By team/assignee
