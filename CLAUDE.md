# AegisContext

An open-source (Apache-2.0) Claude Code plugin (mod) that hides secrets before the model sees them.
Spec: @docs/engineering/spec.md. Plan: @docs/engineering/plan.md. Progress: docs/engineering/progress.md.

## Workflow

- 7 steps (`docs/engineering/plan.md`, "The 7 steps"); one step per session.
- Loop: `/plan-step` (in plan mode) → I approve → tests first, then code → `/verify` → fix → `/ship` → `/clear`.
- Steps 3, 6 and 8 end with an audit: `/security-review` and `/code-review high` before `/ship`.
- If a step spans sessions, commit a `step <n> (wip): ...` checkpoint when I ask; no PR until `/ship`.
- Spec and plan: propose a change, edit only after I say yes, and log it as a decision.
- Parked features go to spec §23; bugs and unfinished bits go to progress "Known issues". Nothing deferred lives only in session notes.
- [Step 0] items in the spec are unconfirmed. Don't build on them until `docs/engineering/findings-step0.md` confirms them.

## Questions

- Research first (docs/, code, the mod API types named by the `plugin-authoring` skill, official docs, a quick scratch experiment). Don't ask what you can find out.
- Ask with AskUserQuestion, recommended option first and labelled "(Recommended)". Give each option's main pro and con.
- Back the recommendation with at least one source actually read or run this session (`file:line`, spec §/R-id, D-id, findings row, docs URL, test output). Never invent sources or numbers. Label anything from memory "(unverified)". If evidence is weak, say so and propose the cheapest way to get it.
- Don't reopen an accepted decision in `docs/engineering/decision-log.md` without saying so.

## Rules

- Write the tests first, then the code. Run the tests before saying you're done.
- Never change or delete a test to make it pass. If a test seems wrong, stop and ask.
- If the spec is unclear or seems wrong, stop and ask. Don't guess.
- TypeScript only. No runtime libraries in the plugin; everything that runs is in this repo.
- Dev dependencies (build and test tools) are pinned with a lockfile. Don't add one without asking.
- The tool must never contact the network and must never write a secret to disk unencrypted (logs, reports and temp files included). One exception, only while the optional put-back setting is on (off by default, D-096): the tool may hand Claude Code's own Write or Edit a value to save into a file that already holds it. This rule is about the product. Claude may read official docs online while researching.
- Code copied from anywhere else must be credited in THIRD_PARTY_LICENSES before it is merged. Today that is only the Gitleaks rules.
- Cross-platform: the maintainer develops on Windows. Scripts are Node, not bash. Build paths with `path.join`, never hard-coded `/` or `\`.

## Git

- One branch per step: `step-0` … `step-8`, from `develop`.
- Commit only in `/ship` (or a wip checkpoint I ask for). `/ship` pushes the step branch (no force) and opens a PR into `develop`. I review and merge; Claude never merges.
- Never force-push, amend published commits or rewrite history.

## Fake secrets in tests

- Never use real secrets. Ever.
- Build fake keys at test time by joining pieces ("ghp_" + "abc..."), so GitHub secret scanning doesn't flag the repo.
- Logs, notes and the docs/ files never contain a secret, not even a fake one written whole.

## Commands

- Tests: `npm test` (Node's built-in `node:test`, runs `tests/**/*.test.ts` directly; Node 24, see `.nvmrc`)
- Typecheck: `npm run typecheck` (`tsc -p .`, no emit; covers `src/`, `tools/`, `tests/`, not `plugin/` or `experiments/`)
- Install dev tools: `npm ci --ignore-scripts` (exact versions from `package-lock.json`)
- Check the plugin: `claude plugin validate ./plugin`
- Plugin tests: `claude plugin test ./plugin`
- Step 0 probe: `claude plugin test ./experiments/step0-probe`; run it with `claude --plugin-dir "<repo>/experiments/step0-probe"` from a scratch folder (log: `<cwd>/.step0-probe/`)
- Install the pinned Claude Code for the kit: `npm ci --ignore-scripts --prefix tools/leak-test/claude-pin` (about 320 MB, its own lockfile)
- Leak test kit: `npm run leak-test:baseline` (empty tool: every fake must be seen; add `-- --require-pinned` to refuse another version) and `npm run leak-test` (the tool in `plugin/`: no fake may be seen). `-- --only <scenario>` runs one. Exit codes: 0 pass, 1 leak or blind, 2 invalid run
