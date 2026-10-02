# Contributing

Open a template request with the job, required inputs, expected result, and a fictional example. For a bug, include the file, client version, reproduction steps, and expected behavior. Read [AGENTS.md](AGENTS.md) before changing files.

Keep each pull request about one job. Add the template, update its README entry and validator coverage, and run this command with Node.js 22 or later from the repository root:

```sh
node scripts/check.mjs
```

Edit scripts/jobs.mjs and scripts/logic.mjs, then run node scripts/generate.mjs. Update fixtures and checks for new jobs; export only fictional values and unconfigured connections.

## Style

- Write in active voice and sentence case.
- Use American English and plain words.
- Answer the heading in the first two sentences.
- Keep one idea per paragraph.
- Name the action, input, and result instead of an abstract benefit.
- Label fictional examples and link the source for factual claims.
- Cut sentences that add no information; end when the answer is complete.
- Avoid hype, emoji, exclamation marks, and em dashes.

Contributions use the [MIT license](LICENSE). Follow the [code of conduct](CODE_OF_CONDUCT.md); report vulnerabilities through [SECURITY.md](SECURITY.md).
