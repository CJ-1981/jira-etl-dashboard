/**
 * Average First Response Time Plugin
 * Calculates average business hours from ticket creation to first human response
 * Response is defined as first transition or first non-reporter comment
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const firstResponseTimePlugin: KpiPlugin = {
  id: 'first_response_time',
  name: 'Avg. First Response Time',
  description: 'Average business hours from ticket creation to the first transition or first non-reporter comment.',
  category: 'builtin',
  domain: 'processing-time',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'hours',

  calculate(context: KpiContext): KpiResult[] {
    const issues = context.issues;
    if (issues.length === 0) {
      return [{ name: 'Avg. First Response Time', value: 0, unit: 'hours' }];
    }

    let totalHours = 0;
    let respondedCount = 0;
    const ticketKeys: string[] = [];

    for (const issue of issues) {
      // 1. Find first transition out of initial status
      const firstTransition = issue.transitions.length > 0 ? issue.transitions[0] : null;
      const firstTransitionTime = firstTransition?.occurredAt.getTime() || Infinity;

      // 2. Find first comment by someone other than reporter
      const firstComment = issue.comments.find((c) => c.author !== issue.reporter);
      const firstCommentTime = firstComment?.created.getTime() || Infinity;

      const responseTimeMs = Math.min(firstTransitionTime, firstCommentTime);

      if (responseTimeMs !== Infinity) {
        const responseDate = new Date(responseTimeMs);
        const hours = calculateBusinessHours(issue.created, responseDate, {
          regions: context.holidays.regions,
          workStartHour: context.holidays.workStartHour,
          workEndHour: context.holidays.workEndHour,
          workDaysPerWeek: context.holidays.workDaysPerWeek,
        });
        totalHours += hours;
        respondedCount++;
        ticketKeys.push(issue.key);
      }
    }

    if (respondedCount === 0) {
      return [{ name: 'Avg. First Response Time', value: 0, unit: 'hours' }];
    }

    return [
      {
        name: 'Avg. First Response Time',
        value: Math.round((totalHours / respondedCount) * 100) / 100,
        unit: 'hours',
        ticketKeys,
        details: [
          { label: 'Responded Tickets', value: respondedCount },
          { label: 'Total Tickets', value: issues.length },
        ],
      },
    ];
  },
};

export default firstResponseTimePlugin;
