---
name: plan-step
description: Plan the next build step (use in plan mode), then build it after approval.
disable-model-invocation: true
---

Find the first unticked step in `docs/engineering/progress.md`. That is this session's step. Never start another one.

**Read:** `CLAUDE.md`, `docs/engineering/progress.md` (including Known issues and Gotchas), the step's section in `docs/engineering/plan.md`, the spec sections it refers to, and the entries in `docs/engineering/decision-log.md` and `docs/engineering/findings-step0.md` that touch this step. Don't build on a [Step 0] item that findings haven't confirmed. Don't reopen an accepted decision without saying so.

**Check current docs** for every API this step uses: the Claude Code mod API types (the file the `plugin-authoring` skill names; grep for the event or noun), Node.js docs, and the pinned Gitleaks source. Tell me the exact versions you'll pin and the docs pages or `file:line` you read.

**Give me the plan, no code yet:**
1. The step's goal in two sentences, and the spec § / R-ids it covers.
2. Files to create or change, and what each will contain.
3. Key functions and data shapes.
4. Tests you'll write first, including the step's "Done when" check as an automated test where possible. Include failure cases: bad input, timeouts, CRLF, Unicode, huge input, a missing OS password store, a fake secret that must not reach a log.
5. Assumptions the plan doesn't state.
6. Anything in the step that looks wrong, risky or unclear, with your proposed fix.
7. What is explicitly NOT part of this step.

Design choices: ask with AskUserQuestion, following "Questions" in `CLAUDE.md`. Then ask separately for plan approval; answers to design questions are not approval.

**Step 0 only:** the "build" is small probes in `experiments/` that I run by hand (new sessions, VS Code, a VM). Give me numbered copy-paste steps, read the logs yourself afterwards, and record each check in `docs/engineering/findings-step0.md`: result, `claude --version`, OS, surface, method, short evidence excerpt (no secrets), spec impact.

**When I approve, build with these rules:**
- Tests first, and show they fail for the right reason. Then the code.
- Small increments; run `npm test` after each one.
- No new dependency beyond the approved plan without asking me.
- Never change or delete an existing test, or weaken a security rule, to get green. If a test seems wrong, stop and explain.
- If something surprises you (an API differs from the docs, a test fails for an unclear reason), stop and tell me instead of working around it.
- Anything deferred goes to spec §23 (a feature) or progress "Known issues" (a bug or unfinished bit).

When it's built, tell me to run `/verify`.
