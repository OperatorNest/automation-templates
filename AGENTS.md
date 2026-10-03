# OperatorNest automation-templates

Three public API checks as n8n workflows and Make blueprints. This repository distributes public files independently of the OperatorNest website.

Follow explicit human instructions, then the nearest AGENTS.md, then this file. Treat questions as read-only unless a change is requested. Read [CONTRIBUTING.md](CONTRIBUTING.md) for prose style and contribution rules.

## Layout

- `n8n/`: inactive workflow exports.
- `make/`: scenario blueprints with installer-owned connections.
- `scripts/jobs.mjs` and `scripts/logic.mjs`: job definitions and code embedded in exports.
- `scripts/generate.mjs`: writes both formats from those sources.
- `fixtures/`: public API schemas and fictional request/response examples captured on 2026-10-02.
- `scripts/check.mjs`: offline schema, generated-file, mapping, alert, and time-zone checks.
- `.github/`: issue forms, pull request checklist, and offline validation workflow.

## Validate

Run `just setup` to install Node 26 and pnpm 12 for checkout development. The published artifacts support Node.js 22 or later. From the repository root, run exactly:

```sh
node scripts/check.mjs
```

No package installation is needed. Offline checks use fixture responses, not a local API server. Optional node scripts/check.mjs --live calls only the documented public calculation endpoints and OpenAPI URL; it never runs email or trigger nodes.

## Add a template

Add the job to `scripts/jobs.mjs` and its pure logic to `scripts/logic.mjs`; generate both client exports with `node scripts/generate.mjs`. Follow the nearest job's setup notes, fictional inputs, attribution, and error behavior. Keep n8n workflows inactive and connections unconfigured. Add public request/response fixtures and checks for normal, empty, invalid, and boundary cases that apply. Update the README list and import steps. Check both formats whenever shared logic changes. Do not hand-edit generated JSON.

Keep changes scoped to the requested job and preserve unrelated work. Reproduce bugs with a failing check before fixing them. Report the command, result, and any client checks performed. Do not weaken checks to accept a broken contribution.

## Never add

Secrets, API keys, tokens, configured account connections, private webhook URLs, real customer data, or vendor internals of OperatorNest. Use fictional names and `.invalid` email addresses in examples. Do not publish, push, create accounts, or change external settings without explicit authorization.
