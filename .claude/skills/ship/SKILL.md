---
name: ship
description: Finish the step - update progress and decisions, commit, push the step branch and open a PR.
disable-model-invocation: true
---

Only if no issue from `/verify` is left to fix (if there is one, stop and list it):

1. Update `docs/engineering/progress.md`:
   - tick the step
   - add anything partial or deferred to Known issues (parked features go to spec §23)
   - add new gotchas
   - add a 3–5 line session note
   - set Current focus to the next unticked step
2. Add each real decision from this step to `docs/engineering/decision-log.md` (next D-number, plus an index row) in the short form: Decision / Why / Rejected alternative / Evidence. Use my reason where I gave one; if you don't know it, ask. Skip this if there were none.
3. Check that no file being committed holds a real-looking secret or a whole fake one.
4. Show me `git status`, then commit everything on the step branch as `step <n>: <one-line summary>`, ending with the Co-Authored-By line from the system attribution.
5. Push the step branch (`git push -u origin step-<n>`; never force). Open a PR with `gh pr create --base develop --head step-<n>`, titled `Step <n>: <name>`, with a short body (what's built, decisions by D-id, known issues) ending with the PR attribution line.
6. Run `gh pr checks --watch` and report each OS's result and the PR link. Don't merge, approve or close it; I merge.

Then remind me to merge, `/clear`, and start the next step from `develop` with `/plan-step`.
