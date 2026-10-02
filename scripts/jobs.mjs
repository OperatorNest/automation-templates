export const jobs = [
  {
    id: 'weekly-api-budget', title: 'Check weekly AI API budgets', tool: 'ai-api-cost-calculator',
    fixture: {
      request: { inputTokens: 10000, cachedInputTokens: 5000, outputTokens: 2000, requestsPerDay: 100, requestsPerMonth: 3000, modelIds: ['anthropic/claude-opus-5-5', 'openai/gpt-5.4'] },
      thresholdUsdPerWeek: 25,
    },
    note: 'For operators checking a recurring API workload before the next week starts.\n\n### How it works\nEvery Monday at 09:00 UTC, the workflow sends token volumes to the public cost API. It estimates seven days of usage for each selected model and emails when any estimate exceeds your weekly threshold or has missing rates. Models are alternatives for the same workload. Estimates exclude non-token charges. API failures stop the run; check execution errors.\n\n### Setup\nEdit the example token volumes, request volumes, model IDs and threshold in Budget inputs. Set your email connection, sender and recipient before publishing. Test a low threshold that sends an alert, then a high threshold that sends none. Change the trigger and workflow time zone to match your reporting day.\n\nCalculation by [OperatorNest](https://operatornest.com/tools/ai-api-cost-calculator?utm_source=n8n&utm_medium=template&utm_campaign=weekly-api-budget). No OperatorNest account required.',
  },
  {
    id: 'team-meeting-slots', title: 'Find meeting slots for a distributed team', tool: 'meeting-time-zone-planner',
    fixture: { date: '2026-10-05', people: [{ name: 'Sam', zone: 'America/Los_Angeles' }, { name: 'Priya', zone: 'America/New_York' }] },
    note: 'For teams arranging a recurring meeting across time zones.\n\n### How it works\nThe webhook receives a date and 2 to 8 people with IANA time zones. The date belongs to the first person. The public API checks 30-minute slots inside each person’s 09:00 to 17:00 workday. This workflow returns contiguous overlap windows, three ranked slots and an explicit no-overlap result. It does not read calendars or book meetings. API failures stop the run.\n\n### Setup\nPOST the README example as JSON to the test webhook. Replace the example names, date and zones with your team’s details. Confirm the returned UTC window and local start labels. Test a team with no shared working hours. Then publish and use the production webhook URL. Check each future meeting date separately because DST can change the overlap.\n\nCalculation by [OperatorNest](https://operatornest.com/tools/meeting-time-zone-planner?utm_source=n8n&utm_medium=template&utm_campaign=team-meeting-slots). No OperatorNest account required.',
  },
  {
    id: 'recurring-schedule', title: 'Validate recurring task schedules', tool: 'recurring-task-planner',
    fixture: { schedule: '0 9 * * 1', startDate: '2026-10-05', zone: 'America/New_York', title: 'Investor update', minutes: 35, owner: 'delegate' },
    note: 'For operators checking a weekly, biweekly or monthly task before scheduling it.\n\n### How it works\nThe workflow parses a plain schedule or a supported five-field cron expression. Plain examples: weekly MO 09:00, biweekly MO 09:00, monthly 15 09:00. Cron supports one weekday or one month day from 1 to 28, with a fixed hour and minute. Other expressions fail before the API call. The API returns a calendar rule; this workflow adds six local runs, UTC candidates and warnings for DST gaps or repeated times. It does not start tasks.\n\n### Setup\nPOST the README example to the test webhook. Set the start date, IANA time zone, task title, duration and owner. Confirm the next six runs and choose your scheduler’s DST policy. Then publish and use the production webhook URL. API failures stop the run.\n\nCalculation by [OperatorNest](https://operatornest.com/tools/recurring-task-planner?utm_source=n8n&utm_medium=template&utm_campaign=recurring-schedule). No OperatorNest account required.',
  },
];
