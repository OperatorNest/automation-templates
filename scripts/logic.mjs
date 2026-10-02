// These pure functions are embedded in the workflow Code nodes by generate.mjs.
export function parseSchedule(raw) {
  if (typeof raw !== 'string' || raw.length > 100) throw new Error('Enter a supported schedule of at most 100 characters.');
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const plain = /^(weekly|biweekly) (MO|TU|WE|TH|FR|SA|SU) ((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(raw);
  if (plain) return { frequency: plain[1], day: plain[2], monthday: 1, time: plain[3] };
  const monthly = /^monthly ([1-9]|1\d|2[0-8]) ((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(raw);
  if (monthly) return { frequency: 'monthly', day: 'MO', monthday: Number(monthly[1]), time: monthly[2] };
  const cron = /^(\d{1,2}) (\d{1,2}) (\*|\d{1,2}) \* (\*|[0-7])$/.exec(raw);
  if (cron && Number(cron[1]) <= 59 && Number(cron[2]) <= 23) {
    const time = `${cron[2].padStart(2, '0')}:${cron[1].padStart(2, '0')}`;
    if (cron[3] === '*' && cron[4] !== '*') return { frequency: 'weekly', day: days[Number(cron[4]) % 7], monthday: 1, time };
    if (cron[4] === '*' && Number(cron[3]) >= 1 && Number(cron[3]) <= 28) return { frequency: 'monthly', day: 'MO', monthday: Number(cron[3]), time };
  }
  throw new Error('Use weekly MO 09:00, biweekly MO 09:00, monthly 15 09:00, or fixed weekly/monthly five-field cron. Daily, ranges, lists, steps and month days above 28 are unsupported.');
}

export function prepare(id, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Send a JSON object.');
  let request;
  if (id === 'weekly-api-budget') {
    if (typeof input.thresholdUsdPerWeek !== 'number' || !Number.isFinite(input.thresholdUsdPerWeek) || input.thresholdUsdPerWeek < 0) throw new Error('Set a nonnegative weekly threshold in USD.');
    request = input.request;
  } else if (id === 'team-meeting-slots') {
    request = { date: input.date, people: input.people };
  } else {
    if (typeof input.zone !== 'string' || !input.zone.length) throw new Error('Set an IANA time zone.');
    new Intl.DateTimeFormat('en-US', { timeZone: input.zone }).format(0);
    request = { startDate: input.startDate, tasks: [{ title: input.title, ...parseSchedule(input.schedule), minutes: input.minutes, owner: input.owner }] };
  }
  return { config: input, request, requestJson: JSON.stringify(request) };
}

export function utcCandidates(local, zone) {
  const target = Date.parse(`${local}Z`);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = (instant) => {
    const p = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  };
  const offsets = new Set();
  for (let hour = -36; hour <= 36; hour += 3) {
    const instant = target + hour * 3600000;
    offsets.add(Date.parse(`${wall(instant)}Z`) - instant);
  }
  return [...offsets].map(offset => target - offset).filter(instant => wall(instant) === local)
    .sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
}

export function finish(id, result, config, platform) {
  let output;
  if (id === 'weekly-api-budget') {
    const estimates = result.estimates.map(e => ({ modelId: e.modelId, usdPerWeek: e.perDay === null ? null : e.perDay * 7 }));
    const over = estimates.filter(e => e.usdPerWeek === null || e.usdPerWeek > config.thresholdUsdPerWeek);
    output = { alert: over.length > 0, estimates, thresholdUsdPerWeek: config.thresholdUsdPerWeek,
      message: over.length ? `Weekly API budget needs attention. Threshold: USD ${config.thresholdUsdPerWeek}.\n${over.map(e => `${e.modelId}: ${e.usdPerWeek === null ? 'rates unavailable' : `USD ${e.usdPerWeek.toFixed(2)} / week`}`).join('\n')}` : 'All selected model estimates are within the weekly threshold.',
      assumptions: result.assumptions, provenance: result.provenance };
  } else if (id === 'team-meeting-slots') {
    const slots = result.rows.filter(r => r.inside.every(Boolean)).sort((a, b) => a.start - b.start);
    const windows = [];
    for (const slot of slots) {
      const previous = windows[windows.length - 1];
      if (previous && previous.end === slot.start) { previous.end = slot.start + 1800000; previous.endUtc = new Date(previous.end).toISOString(); }
      else windows.push({ start: slot.start, end: slot.start + 1800000, startUtc: slot.startUtc, endUtc: new Date(slot.start + 1800000).toISOString(), localStartLabels: slot.labels });
    }
    output = { status: windows.length ? 'overlap' : 'no_overlap', windows, bestSlots: result.bestSlots, overlapCount: result.overlapCount, assumptions: result.assumptions, provenance: result.provenance };
  } else {
    const task = result.schedules[0];
    const nextRuns = [];
    const warnings = ['Runs start on or after startDate, including the whole first day. Holidays and missed-run recovery are not checked.', 'The API calendar uses floating local times. Set the scheduler time zone explicitly; UTC offsets can change with DST.', 'Choose whether to skip or move nonexistent DST times, and whether repeated times run once or twice.'];
    for (let i = 0; i < 6; i++) {
      const date = new Date(`${task.firstDate}T00:00:00Z`);
      if (task.frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + i);
      else date.setUTCDate(date.getUTCDate() + i * (task.frequency === 'biweekly' ? 14 : 7));
      const local = `${date.toISOString().slice(0, 10)}T${task.time}:00`;
      const candidates = utcCandidates(local, config.zone);
      const status = candidates.length === 0 ? 'nonexistent' : candidates.length === 1 ? 'unique' : 'repeated';
      nextRuns.push({ local, zone: config.zone, status, utcCandidates: candidates });
      if (status !== 'unique') warnings.push(`${local} in ${config.zone} is ${status}. Check the scheduler DST policy.`);
    }
    if (nextRuns.some(run => run.local.slice(0, 10) > '2100-12-31')) throw new Error('The next six runs exceed the supported date range. Use an earlier startDate.');
    output = { nextRuns, warnings, recurrenceRule: task.recurrenceRule, monthlyHours: result.monthlyHours, ics: result.ics, assumptions: result.assumptions, provenance: result.provenance };
  }
  const tool = { 'weekly-api-budget': 'ai-api-cost-calculator', 'team-meeting-slots': 'meeting-time-zone-planner', 'recurring-schedule': 'recurring-task-planner' }[id];
  output.attribution = { name: 'OperatorNest', url: `https://operatornest.com/tools/${tool}?utm_source=${platform}&utm_medium=template&utm_campaign=${id}` };
  if (output.message) output.message += `\nCalculation by OperatorNest: ${output.attribution.url}`;
  return { ...output, ...(output.message ? { messageHtml: `<pre>${output.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` } : {}), responseJson: JSON.stringify(output) };
}

export const embedded = {
  prepare: `${parseSchedule.toString()}\n${prepare.toString()}`,
  finish: `${utcCandidates.toString()}\n${finish.toString()}`,
};
