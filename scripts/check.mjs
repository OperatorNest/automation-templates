#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import { root, artifacts } from './generate.mjs';
import { jobs } from './jobs.mjs';
import { BANNED, RATIONED, matches } from './voice-rules.mjs';

const live = process.argv.includes('--live');
assert(process.argv.slice(2).every(arg => arg === '--live'), 'Usage: node scripts/check.mjs [--live]');
const openapi = JSON.parse(await readFile(new URL('../fixtures/openapi.json', import.meta.url), 'utf8'));
const fixtures = JSON.parse(await readFile(new URL('../fixtures/responses.json', import.meta.url), 'utf8'));

function validate(value, schema, document, path = '$') {
  if (schema.$ref) return validate(value, schema.$ref.slice(2).split('/').reduce((v, k) => v[k], document), document, path);
  if ('const' in schema) assert.deepEqual(value, schema.const, `${path}: const`);
  if (schema.enum) assert(schema.enum.includes(value), `${path}: enum`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type) assert([schema.type].flat().some(t => t === type || (t === 'integer' && Number.isSafeInteger(value))), `${path}: type ${schema.type}`);
  if (type === 'object') {
    for (const key of schema.required ?? []) assert(Object.hasOwn(value, key), `${path}.${key}: required`);
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties?.[key];
      assert(child || schema.additionalProperties !== false, `${path}.${key}: additional property`);
      if (child) validate(item, child, document, `${path}.${key}`);
      else if (typeof schema.additionalProperties === 'object') validate(item, schema.additionalProperties, document, `${path}.${key}`);
    }
  }
  if (type === 'array') {
    assert(value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity), `${path}: array length`);
    if (schema.uniqueItems) assert.equal(new Set(value.map(v => JSON.stringify(v))).size, value.length, `${path}: unique items`);
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, document, `${path}[${i}]`));
  }
  if (type === 'number') assert(Number.isFinite(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity), `${path}: bounds`);
  if (type === 'string') {
    assert(Array.from(value).length >= (schema.minLength ?? 0) && Array.from(value).length <= (schema.maxLength ?? Infinity), `${path}: string length`);
    if (schema.pattern) assert(new RegExp(schema.pattern).test(value), `${path}: pattern`);
    if (schema.format === 'date') assert(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, `${path}: real date`);
    if (schema.format === 'date-time') assert(Number.isFinite(Date.parse(value)), `${path}: date-time`);
    if (schema.format === 'uri') assert(new URL(value).protocol, `${path}: URI`);
  }
}
const runCode = (source, context) => JSON.parse(JSON.stringify(runInNewContext(`(function() { ${source}\n})()`, context, { timeout: 5000 })));
const schemaFor = (doc, url) => {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://operatornest.com');
  assert.equal(parsed.search, '');
  const operation = doc.paths[parsed.pathname]?.post;
  assert(operation, `Undocumented POST: ${url}`);
  return operation;
};
function localResult(job, request) {
  const fixture = fixtures.cases.find(item => item.job === job.id && isDeepStrictEqual(item.request, request));
  assert(fixture, `${job.id}: missing offline request/response fixture`);
  return structuredClone(fixture.response);
}

function n8nRunner(workflow, fixture) {
  assert.equal(workflow.active, false);
  const names = workflow.nodes.map(n => n.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(workflow.nodes.map(n => n.id)).size, names.length);
  for (const [from, connections] of Object.entries(workflow.connections)) {
    assert(names.includes(from));
    for (const port of connections.main) for (const edge of port) assert(names.includes(edge.node));
  }
  const codes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code');
  const http = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  assert.equal(http.length, 1, 'One calculation per workflow');
  const set = workflow.nodes.find(n => n.type === 'n8n-nodes-base.set');
  const prepared = runCode(codes[0].parameters.jsCode, { $input: { first: () => ({ json: set ? JSON.parse(set.parameters.jsonOutput) : { body: fixture } }) } })[0].json;
  assert.equal(http[0].parameters.method, 'POST');
  assert.equal(http[0].parameters.authentication, 'none');
  assert.equal(http[0].parameters.specifyBody, 'json');
  assert.equal(http[0].parameters.sendBody, true);
  const request = JSON.parse(runInNewContext(http[0].parameters.jsonBody.slice(3, -2), { $json: prepared }, { timeout: 1000 }));
  const finish = (result, config = prepared.config) => runCode(codes[1].parameters.jsCode, { $input: { first: () => ({ json: result }) }, $: () => ({ first: () => ({ json: { config } }) }) })[0].json;
  const notes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.stickyNote');
  const overview = notes.filter(n => n.parameters.color === 1);
  assert.equal(overview.length, 1, 'One yellow overview');
  assert(overview[0].position[0] < 0, 'Overview at top left');
  const wordCount = overview[0].parameters.content.split(/\s+/).length;
  assert(wordCount >= 100 && wordCount <= 300, 'Overview: 100 to 300 words');
  assert(overview[0].parameters.content.includes('### How it works') && overview[0].parameters.content.includes('### Setup'));
  assert(notes.some(n => n.parameters.color === 7 && n.parameters.width >= 500), 'Section notes group multiple nodes');
  for (const note of notes) {
    const prose = note.parameters.content.replace(/https?:\/\/[^\s)]+/g, '');
    for (const rule of BANNED) assert.equal(matches(rule, prose).length, 0, `Sticky note: ${rule.label}`);
    for (const rule of RATIONED) assert(matches(rule, prose).length <= 1, `Sticky note: ${rule.label}`);
  }
  return { url: http[0].parameters.url, request, finish, prepared };
}

function makeRunner(blueprint, fixture) {
  const flow = blueprint.flow;
  assert.equal(new Set(flow.map(m => m.id)).size, flow.length);
  const values = { 1: fixture };
  const resolve = expression => {
    const match = /^\{\{(\d+)(?:\.([^}]+))?\}\}$/.exec(expression);
    assert(match, `Unsupported mapping: ${expression}`);
    assert(Object.hasOwn(values, match[1]), `Unbound module ${match[1]}`);
    return match[2] ? match[2].split('.').reduce((v, k) => v[k], values[match[1]]) : values[match[1]];
  };
  const codes = flow.filter(m => m.module === 'code:ExecuteCode');
  const http = flow.filter(m => m.module === 'http:ActionSendData');
  assert.equal(http.length, 1, 'One calculation per scenario');
  const execute = code => runCode(code.mapper.codeEditorJavascript, { input: Object.fromEntries(code.mapper.input.map(v => [v.name, resolve(v.value)])) });
  const prepared = execute(codes[0]);
  values[codes[0].id] = { result: prepared };
  assert.equal(http[0].mapper.method, 'post');
  assert.equal(http[0].mapper.contentType, 'application/json');
  assert.equal(http[0].mapper.bodyType, 'raw');
  assert.equal(http[0].mapper.parseResponse, true);
  assert.equal(http[0].parameters.handleErrors, true);
  assert(!http[0].mapper.authUser && !http[0].mapper.authPass);
  const request = JSON.parse(resolve(http[0].mapper.data));
  const finish = (result, config = prepared.config) => {
    values[http[0].id] = { data: result };
    values[codes[0].id].result.config = config;
    const output = execute(codes[1]);
    values[codes[1].id] = { result: output };
    const response = flow.find(m => m.module === 'gateway:WebhookRespond');
    if (response) assert.deepEqual(JSON.parse(resolve(response.mapper.body)), JSON.parse(output.responseJson));
    const email = flow.find(m => m.module === 'google-email:ActionSendEmail');
    if (email) {
      assert.equal(resolve(email.filter.conditions[0][0].a), output.alert);
      assert.equal(resolve(email.mapper.html), output.messageHtml);
    }
    return output;
  };
  return { url: http[0].mapper.url, request, finish, prepared };
}

// Verify every checked-in example against the public contract, including variants.
for (const fixture of fixtures.cases) {
  const job = jobs.find(job => job.id === fixture.job);
  assert(job, `Unknown fixture job: ${fixture.job}`);
  const operation = schemaFor(openapi, `https://operatornest.com/api/tools/${job.tool}`);
  validate(fixture.request, operation.requestBody.content['application/json'].schema, openapi);
  validate(fixture.response, operation.responses['200'].content['application/json'].schema, openapi);
}

const expected = artifacts();
for (const folder of ['n8n', 'make']) {
  const actual = (await readdir(`${root}/${folder}`)).filter(f => f.endsWith('.json')).sort();
  assert.deepEqual(actual, expected.filter(([p]) => p.startsWith(`${folder}/`)).map(([p]) => p.split('/')[1]).sort(), `${folder}: unexpected/missing template`);
}
let liveDoc;
if (live) {
  const response = await fetch('https://operatornest.com/openapi.json', { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'Production OpenAPI');
  liveDoc = await response.json();
}
let count = 0;
for (const [path, expectedText] of expected) {
  const raw = await readFile(`${root}/${path}`, 'utf8');
  assert.equal(raw, expectedText, `${path}: stale generated file; run generate.mjs`);
  const job = jobs.find(job => path.includes(job.id));
  const workflow = JSON.parse(raw);
  const runner = path.startsWith('n8n/') ? n8nRunner : makeRunner;
  const runtime = runner(workflow, job.fixture);
  for (const doc of [openapi, liveDoc].filter(Boolean)) validate(runtime.request, schemaFor(doc, runtime.url).requestBody.content['application/json'].schema, doc);
  assert(Buffer.byteLength(JSON.stringify(runtime.request)) <= 32768);
  const local = localResult(job, runtime.request);
  validate(local, schemaFor(openapi, runtime.url).responses['200'].content['application/json'].schema, openapi);
  const output = runtime.finish(local);
  assert.equal(output.attribution.name, 'OperatorNest');
  assert.equal(new URL(output.attribution.url).searchParams.get('utm_source'), path.split('/')[0]);
  if (job.id === 'weekly-api-budget') {
    assert.equal(output.alert, true);
    assert.equal(runtime.finish(local, { thresholdUsdPerWeek: 1e9 }).alert, false);
    assert.equal(runtime.finish({ ...local, estimates: [{ modelId: 'missing', perDay: null }] }, { thresholdUsdPerWeek: 1e9 }).alert, true);
    assert.equal(runtime.finish({ ...local, estimates: [{ modelId: 'boundary', perDay: 5 }] }, { thresholdUsdPerWeek: 35 }).alert, false);
  } else if (job.id === 'team-meeting-slots') {
    assert.equal(output.windows.length, 1);
    assert.equal(output.windows[0].startUtc, '2026-10-05T16:00:00.000Z');
    assert.equal(output.windows[0].endUtc, '2026-10-05T21:00:00.000Z');
    const none = runner(workflow, { date: '2026-10-05', people: [{ name: 'Sam', zone: 'Asia/Kolkata' }, { name: 'Priya', zone: 'America/Los_Angeles' }] });
    assert.equal(none.finish(localResult(job, none.request)).status, 'no_overlap');
  } else {
    assert.equal(output.nextRuns.length, 6);
    assert.equal(output.nextRuns[0].utcCandidates[0], '2026-10-05T13:00:00.000Z');
    assert.equal(output.nextRuns[4].utcCandidates[0], '2026-11-02T14:00:00.000Z');
    for (const [schedule, startDate, zone, status, expectedUtc] of [
      ['weekly SU 02:30', '2026-03-08', 'America/New_York', 'nonexistent', []],
      ['weekly SU 01:30', '2026-11-01', 'America/New_York', 'repeated', ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']],
      ['15 9 15 * *', '2026-12-20', 'Asia/Kathmandu', 'unique', ['2027-01-15T03:30:00.000Z']],
      ['biweekly MO 09:00', '2026-10-05', 'UTC', 'unique', ['2026-10-05T09:00:00.000Z']],
    ]) {
      const variant = runner(workflow, { ...job.fixture, schedule, startDate, zone });
      const result = variant.finish(localResult(job, variant.request));
      assert.equal(result.nextRuns[0].status, status);
      assert.deepEqual(result.nextRuns[0].utcCandidates, expectedUtc);
      if (schedule.startsWith('biweekly')) assert.equal(result.nextRuns[1].local, '2026-10-19T09:00:00');
    }
    for (const schedule of ['0 9 * * *', '0 9 31 * *', '0 9 * * 1-5', '0 9 15 * 1', 'monthly 29 09:00', 'every morning']) assert.throws(() => runner(workflow, { ...job.fixture, schedule }));
  }
  if (live) {
    // Only public calculations. Never execute email or workflow trigger nodes.
    const response = await fetch(runtime.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(runtime.request), signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `${path}: production status`);
    const body = await response.json();
    validate(body, schemaFor(liveDoc, runtime.url).responses['200'].content['application/json'].schema, liveDoc);
    runtime.finish(body);
    console.log(`${path}: schema, logic, production 200`);
  } else console.log(`${path}: schema and logic passed`);
  count++;
}
console.log(`${count} templates passed; ${live ? '6 production calculations returned 200' : 'no network calls'}.`);
