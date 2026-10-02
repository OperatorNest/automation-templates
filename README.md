# OperatorNest automation templates

Three recurring checks, each packaged as an n8n workflow and a Make scenario blueprint. They check an API workload budget, shared meeting hours, or recurring task schedules using a public calculation API.

<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>

These templates use the public tool API documented at [operatornest.com](https://operatornest.com/tools/api).

## Templates

Each job has a matching JSON file under `n8n/` and a `.blueprint.json` file under `make/`.

| File stem | Job |
| --- | --- |
| `weekly-api-budget` | Estimate seven days of a fixed workload per selected model and email when rates are missing or an estimate exceeds the threshold. |
| `team-meeting-slots` | Return shared UTC windows, local labels, three ranked 30-minute slots, or an explicit `no_overlap` result. |
| `recurring-schedule` | Validate a supported schedule and return a calendar rule, six local runs with UTC candidates, and DST warnings. |

## Download

Clone the repository or download its archive, then choose the format for your client:

```sh
git clone https://github.com/OperatorNest/automation-templates.git
cd automation-templates
```

## Import into n8n

1. Create an empty workflow. Open the three-dot menu, choose **Import from File**, and select a file from `n8n/`. This is the current [JSON import route](https://docs.n8n.io/build/manage-workflows/export-and-import.md), checked October 2, 2026.
2. Read the setup sticky note. Workflows import inactive. The budget workflow uses Monday at 09:00 UTC; change the Schedule Trigger and workflow time zone if needed.
3. For the budget check, edit the example in **Budget inputs**: token counts per request, request volumes, selected model IDs and `thresholdUsdPerWeek`. Choose model IDs from the catalog described in the API docs. Each model is an alternative for the same workload; estimates are not added together. Weekly estimates use `perDay × 7`. The monthly volume only controls the API’s separate monthly estimate.
4. Configure the **Email budget alert** node with your SMTP credential, sender and recipient. Test the above-threshold branch with an inbox you own, then test a threshold above all estimates. Missing rates also require attention. The sample addresses end in `.invalid`.
5. For meeting and schedule workflows, choose **Listen for test event** on the webhook and POST one of the examples below. After publishing, use the production webhook URL shown by n8n.

The workflows use built-in Schedule Trigger, Edit Fields, Webhook, Code, HTTP Request, If, Send Email, Respond to Webhook and Sticky Note nodes. HTTP Request uses the supported JSON body format, node version 4.2. Credentials are supplied after import.

## Import into Make

1. Create an empty scenario. Open the three-dot menu, choose **Import blueprint**, select a file from `make/`, and save. Make [supports JSON blueprints under 2 MB](https://help.make.com/blueprints), checked October 2, 2026.
2. These blueprints use **Make Code > Run code**. Confirm that module is available in your account before import. The code ships inside the blueprint and uses standard JavaScript. See the [Make Code documentation](https://apps.make.com/code).
3. For the budget check, edit the example inputs in module 1. Connect your Gmail account in **Email budget alert** and replace the sample recipient. Configure the scenario schedule to run every Monday at 09:00 in your chosen time zone; scheduling is set outside the blueprint. Run once with a low threshold and once with a high threshold before enabling the schedule.
4. For meeting and schedule checks, create your own **Custom webhook** in module 1. Use **Redetermine data structure**, send the matching JSON example below, then save. Keep JSON pass-through off so fields map individually. Run once and send the example again. The last module returns JSON to that caller. Set the scenario schedule to **Immediately** before activating it.
5. Confirm module mappings after the sample run: HTTP receives `Prepare request → result → requestJson`; **Build result** receives HTTP `data` and the first code module’s `result.config`; the webhook response receives the last code module’s `result.responseJson`.
6. The first code module includes setup and attribution comments. Results and budget emails include the matching tool link below. Add a scenario note with that link and “Calculation by OperatorNest. No OperatorNest account required.” Make scenario notes are configured in the editor.

The blueprints use HTTP version 3 and installer-owned webhook and email connections. The module layout follows [Make’s blueprint reference](https://github.com/integromat/make-skills/blob/main/skills/make-scenario-building/blueprint-construction.md). Export your configured scenario again before submitting it to a gallery; remove private webhook IDs and credential references.

| Job | Attribution link |
| --- | --- |
| Budget | [OperatorNest API cost calculator](https://operatornest.com/tools/ai-api-cost-calculator?utm_source=make&utm_medium=template&utm_campaign=weekly-api-budget) |
| Meetings | [OperatorNest meeting planner](https://operatornest.com/tools/meeting-time-zone-planner?utm_source=make&utm_medium=template&utm_campaign=team-meeting-slots) |
| Schedules | [OperatorNest recurring task planner](https://operatornest.com/tools/recurring-task-planner?utm_source=make&utm_medium=template&utm_campaign=recurring-schedule) |

## Example webhook inputs

Send `Content-Type: application/json` to the webhook URL shown by your workflow editor.

Meeting example:

```json
{
  "date": "2026-10-05",
  "people": [
    { "name": "Sam", "zone": "America/Los_Angeles" },
    { "name": "Priya", "zone": "America/New_York" }
  ]
}
```

Expected overlap: `2026-10-05T16:00:00Z` through `2026-10-05T21:00:00Z`. The date is local to the first person. The API assumes 09:00 to 17:00 workdays and a 30-minute meeting. It does not check holidays or calendar availability. To arrange a weekly meeting, check each date separately because DST can change the overlap.

Schedule example:

```json
{
  "schedule": "0 9 * * 1",
  "startDate": "2026-10-05",
  "zone": "America/New_York",
  "title": "Investor update",
  "minutes": 35,
  "owner": "delegate"
}
```

Expected first run: October 5 at 09:00 local, or 13:00 UTC. November 2 at 09:00 local is 14:00 UTC. `startDate` includes the whole first day. A biweekly schedule anchors to the first matching weekday on or after that date.

Accepted schedule forms:

| Form | Example | Meaning |
| --- | --- | --- |
| Weekly plain schedule | `weekly MO 09:00` | Every Monday |
| Biweekly plain schedule | `biweekly MO 09:00` | Every second Monday |
| Monthly plain schedule | `monthly 15 09:00` | On the 15th of each month |
| Weekly five-field cron | `0 9 * * 1` | Fixed minute and hour, any month, one weekday from 0 to 7; 0 and 7 mean Sunday |
| Monthly five-field cron | `0 9 15 * *` | Fixed minute and hour, any month, one month day from 1 to 28 |

Weekday codes are `MO TU WE TH FR SA SU`. Unsupported schedules fail before the API call: daily cron, seconds, lists, ranges, steps, named cron weekdays, fixed months, month days above 28, and simultaneous day-of-month and weekday restrictions. The templates parse schedules locally; the API receives only its documented task fields.

Each next run includes `local`, `zone`, `status` and `utcCandidates`. A DST gap returns `nonexistent` with no candidate; a repeated hour returns `repeated` with two candidates. Select your scheduler’s behavior before enabling the task. The API’s calendar uses floating local times. These templates calculate a plan; they do not start tasks or submit calendar events.

## Validate

With Node.js 22 or later, run from the checkout root:

```sh
node scripts/check.mjs
```

No dependencies need installation. Offline checks compare generated exports and execute embedded code against the public schemas and eight request/response fixtures captured from local contract examples on 2026-10-02. They check mappings, alert thresholds, empty overlap, rejected schedules, and DST gaps and repeated hours.

For an optional check against the public API:

```sh
node scripts/check.mjs --live
```

This fetches the public OpenAPI document and performs six calculations. It never runs email or workflow trigger nodes. Live results depend on the current API catalog; offline fixtures use a fixed example snapshot.

After changing job definitions or embedded logic, regenerate both formats:

```sh
node scripts/generate.mjs
node scripts/check.mjs
```

Check imports and connections in your client before activating a workflow. Keep credentials and private webhook URLs out of exported files.

## Contribute and report

Read [CONTRIBUTING.md](CONTRIBUTING.md), propose a template or report a bug through [issues](https://github.com/OperatorNest/automation-templates/issues), and report vulnerabilities through [SECURITY.md](SECURITY.md). Code uses the [MIT license](LICENSE).
