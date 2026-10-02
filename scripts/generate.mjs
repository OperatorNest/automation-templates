import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { jobs } from './jobs.mjs';
import { embedded } from './logic.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const edge = name => ({ node: name, type: 'main', index: 0 });

export function n8n(job) {
  const budget = job.id === 'weekly-api-budget';
  const node = (name, type, version, x, parameters) => ({ id: name.toLowerCase().replaceAll(' ', '-'), name, type: `n8n-nodes-base.${type}`, typeVersion: version, position: [x, 300], parameters });
  const inputName = 'Prepare request';
  const nodes = [
    budget ? node('Monday budget check', 'scheduleTrigger', 1.2, 0, { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [1], triggerAtHour: 9, triggerAtMinute: 0 }] } })
      : { ...node('Receive request', 'webhook', 2, 0, { httpMethod: 'POST', path: `operatornest-${job.id}`, responseMode: 'responseNode', options: {} }), webhookId: `operatornest-${job.id}` },
    node(inputName, 'code', 2, 250, { mode: 'runOnceForAllItems', jsCode: `${embedded.prepare}\nreturn [{ json: prepare(${JSON.stringify(job.id)}, ${budget ? '$input.first().json' : '$input.first().json.body'}) }];` }),
    node('Calculate with OperatorNest', 'httpRequest', 4.2, 500, { method: 'POST', url: `https://operatornest.com/api/tools/${job.tool}`, authentication: 'none', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.request) }}', options: { timeout: 20000, response: { response: { responseFormat: 'json' } } } }),
    node('Build result', 'code', 2, 750, { mode: 'runOnceForAllItems', jsCode: `${embedded.finish}\nreturn [{ json: finish(${JSON.stringify(job.id)}, $input.first().json, $(${JSON.stringify(inputName)}).first().json.config, 'n8n') }];` }),
  ];
  if (budget) nodes.splice(1, 0, node('Budget inputs', 'set', 3.4, 250, { mode: 'raw', jsonOutput: JSON.stringify(job.fixture, null, 2), options: {} }));
  nodes.forEach((n, i) => { n.position[0] = i * 250; });
  const connections = Object.fromEntries(nodes.slice(0, -1).map((n, i) => [n.name, { main: [[edge(nodes[i + 1].name)]] }]));
  if (budget) {
    nodes.push(node('Needs attention', 'if', 2.2, 1250, { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'budget-alert', leftValue: '={{ $json.alert }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }));
    nodes.push(node('Email budget alert', 'emailSend', 2.1, 1500, { fromEmail: 'operator@example.invalid', toEmail: 'recipient@example.invalid', subject: 'Weekly API budget needs attention', emailFormat: 'text', text: '={{ $json.message }}', options: { appendAttribution: false } }));
    connections['Build result'] = { main: [[edge('Needs attention')]] };
    connections['Needs attention'] = { main: [[edge('Email budget alert')], []] };
  } else {
    nodes.push(node('Return result', 'respondToWebhook', 1.4, 1000, { respondWith: 'json', responseBody: '={{ JSON.parse($json.responseJson) }}', options: { responseCode: 200 } }));
    connections['Build result'] = { main: [[edge('Return result')]] };
  }
  nodes.push({ ...node('Setup and attribution', 'stickyNote', 1, 0, { content: `## ${job.title}\n\n${job.note}`, color: 1, height: 650, width: 540 }), position: [-620, -40] });
  nodes.push({ ...node('Prepare and calculate', 'stickyNote', 1, 0, { content: '## Prepare and calculate\nReceive the inputs and call the public tool API.', color: 7, height: 280, width: budget ? 1000 : 750 }), position: [-40, 180] });
  nodes.push({ ...node('Return or alert', 'stickyNote', 1, 0, { content: budget ? '## Check the threshold\nEmail only when an estimate needs attention.' : '## Return the plan\nBuild the result and answer the webhook caller.', color: 7, height: 280, width: budget ? 750 : 500 }), position: [budget ? 960 : 710, 180] });
  return { name: `${job.title} with HTTP Request and OperatorNest`, nodes, connections, active: false, settings: { executionOrder: 'v1', timezone: 'UTC' }, pinData: {}, tags: [] };
}

export function make(job) {
  const budget = job.id === 'weekly-api-budget';
  const module = (id, name, version, mapper, parameters = {}) => ({ id, module: name, version, parameters, mapper, metadata: { designer: { x: (id - 1) * 300, y: 0 } } });
  const code = (id, source, input) => module(id, 'code:ExecuteCode', 0, { language: 'javascript', inputFormat: 'editor', codeEditorJavascript: source, input, dependencies: [] });
  const flow = [];
  if (!budget) flow.push(module(1, 'gateway:CustomWebHook', 1, {}));
  const pre = budget ? 1 : 2;
  const setup = job.note.replaceAll('utm_source=n8n', 'utm_source=make').replace('Budget inputs', 'this code module').replace('workflow time zone', 'scenario time zone').replaceAll('publishing', 'activating').replaceAll('publish', 'activate').replace('test webhook', 'webhook while running once').replace('production webhook URL', 'webhook URL').split('\n').map(line => `// ${line}`).join('\n');
  flow.push(code(pre, `${setup}\n${embedded.prepare}\nreturn prepare(${JSON.stringify(job.id)}, ${budget ? JSON.stringify(job.fixture, null, 2) : 'input'});`, budget ? [] : Object.keys(job.fixture).map(name => ({ name, value: `{{1.${name}}}` }))));
  flow.push(module(pre + 1, 'http:ActionSendData', 3, { url: `https://operatornest.com/api/tools/${job.tool}`, method: 'post', headers: [], qs: [], bodyType: 'raw', contentType: 'application/json', data: `{{${pre}.result.requestJson}}`, parseResponse: true, timeout: 20, shareCookies: false, followRedirect: false, rejectUnauthorized: true, useQuerystring: false, gzip: true }, { handleErrors: true }));
  flow.push(code(pre + 2, `${embedded.finish}\nreturn finish(${JSON.stringify(job.id)}, input.response, input.config, 'make');`, [{ name: 'response', value: `{{${pre + 1}.data}}` }, { name: 'config', value: `{{${pre}.result.config}}` }]));
  if (budget) {
    const email = module(4, 'google-email:ActionSendEmail', 2, { to: ['recipient@example.invalid'], cc: [], bcc: [], from: '', subject: 'Weekly API budget needs attention', html: '{{3.result.messageHtml}}', attachments: [] });
    email.filter = { name: 'Over threshold or missing rates', conditions: [[{ a: '{{3.result.alert}}', o: 'boolean:equal', b: true }]] };
    flow.push(email);
  } else flow.push(module(pre + 3, 'gateway:WebhookRespond', 1, { status: '200', body: `{{${pre + 2}.result.responseJson}}`, headers: [{ key: 'Content-Type', value: 'application/json' }] }));
  flow.forEach((m, i) => { m.metadata.designer.name = ['Receive request', 'Prepare request', 'Calculate with OperatorNest', 'Build result', 'Return result'][i + (budget ? 1 : 0)]; });
  if (budget) flow[3].metadata.designer.name = 'Email budget alert';
  return { name: `${job.title} with OperatorNest`, flow, metadata: { version: 1, instant: !budget, scenario: { maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true, sequential: false, confidential: false, dataloss: false, dlq: false, freshVariables: false }, designer: { orphans: [] } } };
}

export function artifacts() {
  return jobs.flatMap(job => [[`n8n/${job.id}.json`, json(n8n(job))], [`make/${job.id}.blueprint.json`, json(make(job))]]);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [path, value] of artifacts()) {
    await mkdir(`${root}/${path.split('/')[0]}`, { recursive: true });
    await writeFile(`${root}/${path}`, value);
  }
  console.log('Wrote three n8n workflows and three Make blueprints.');
}
