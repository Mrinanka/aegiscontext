---
name: verify
description: Verify the step just built, with real command output and a self-review of the diff.
disable-model-invocation: true
---

Verify the step you just built:

1. Run `npm test` and `npm run typecheck`, plus `claude plugin validate ./plugin` and `claude plugin test ./plugin` if `plugin/` changed (or the same for `experiments/<probe>` in Step 0). Paste the actual output summary, not a description of it. Don't rerun what you already ran since the last change.
2. Run the step's "Done when" check (`docs/engineering/plan.md`, "The 7 steps"). Paste the actual output.
3. Give me the exact commands to run the "Done when" check myself.
4. Review your own diff (`git diff develop...HEAD` plus uncommitted changes) against the step's plan and the rules in `CLAUDE.md`:
   - no runtime dependency, no network call, no unencrypted secret on disk (logs, reports, temp files)
   - no whole fake secret anywhere in the diff, docs or notes
   - `path.join`, no hard-coded separators, Node scripts not bash
   - copied code credited in `THIRD_PARTY_LICENSES`
   - refusing hooks have `.catch`

   List every deviation, shortcut, TODO, skipped test or hard-coded value, and say whether it needs fixing.
5. List anything that is not finished or not working. "Done" only means the check passed.
6. Explain the two most important design choices in this step in plain language, as I would in an interview. Append them to `docs/engineering/design-choices.md` under a `## Step <n>` heading.
7. State clearly which findings need fixing, and which need my input before you can fix them.

**Steps 3, 6 and 8:** remind me to run `/security-review` and `/code-review high` before `/ship`.
