# Progress

Spec: `docs/spec.md`. Plan: `docs/plan.md`. Parked work: spec §23.

**Current focus:** Step 8 is shipped as a PR into `develop`, with Audit 3 and two small fixes still open (Known issues), so it stays unticked until the audits are done. `v0.1.0-rc.1` is tagged on `release`, the default branch, as a draft release. No release until a signing key exists (D-094). After step 8: the owner makes the key, signs `v0.1.0-rc.2`, then the hand checks and the two weeks of daily use start, with the other "Before `v0.1.0`" items in `docs/release-checklist.md`.

## Steps

| Step | What | Branch | ✓ |
|---|---|---|---|
| 0 | Facts | `step-0` | ☑ |
| 1 | Test kit | `step-1` | ☑ |
| 2 | Checker | `step-2` | ☑ |
| 3 | Core hiding + Audit 1 | `step-3` | ☑ |
| 4 | Rest of the main lock | `step-4` | ☑ |
| 5 | Backup lock + tuning | `step-5` | ☑ |
| 6 | Release + Audit 2 | `step-6` | ☑ |
| 7 | Fixes before daily use (D-090) | `step-7` | ☑ |
| 8 | Put secrets back + weekly CI + Audit 3 (D-095) | `step-8` | ☐ |

"Done when" for each step is in `docs/plan.md`, "The 7 steps".

## Known issues

Bugs, unfinished bits and open questions. Features we chose not to build go in spec §23.

- Put-back (step 8): a `-p` run cannot show a permission dialog or the repo notice, so those two are hand checks (`docs/release-checklist.md`). The weekly run's `schedule` starts only after `develop` is merged into `release`; its `push` trigger proves it on `step-8`.
- Put-back (step 8), found by `/verify`, not fixed yet: on every Write or Edit, even with put-back off, `restore` in `plugin/hooks/tools.ts` calls `putBackNow`. A throw there skips the overwrite guard under `allow` (the `tool.call` `.catch` runs the tool as written), and on macOS and Linux `osOf` starts `uname` each time. Read in the code, not measured. Treat a failure as off, and call `osOf` only when the choice file has folders.
- Put-back (step 8), found by `/verify`, not fixed yet: the "could not restore" message goes through `warn`, which shows a kind 3 times and then every 50th (`plugin/hooks/warn.ts:12`), so a later erased secret reaches only the log. Spec §10 says a message and the log say how many.
- Step 8 was shipped before Audit 3, and with the two "not fixed yet" items below: the owner asked to raise the PR first and run `/security-review` and `/code-review high` on it. Scope is everything since `2f00d31`, not only the PR's diff. Fixes go on `step-8`.
- Put-back (step 8), the owner's call on 2026-11-03 (D-097): a broken managed block does not read as off. Managed `put_back: false`, `"Off"`, or a valid `off` beside any other bad managed value leaves `managedOff` false on a first load (scratch run), and a fallback takes the last good value, so a developer's or repo's `on` still counts. Only an error in `/redact doctor` says so.
- Put-back (step 8): whether `$.state` is cleared by `/clear` is unknown (its docs say "for the session"), so the put-back note and the once-a-session notice may carry over. Check with the `/clear` hand check.
- Put-back (step 8): `disk.includes(old_string)` is an exact match, so a multi-line Edit through a placeholder on a CRLF file is not restored if Claude's text has LF endings. It fails safe, as with put-back off. Whether Claude Code's Edit would have matched is from memory (unverified).
- Put-back (step 8): a catch added by `keepHidden` reaches `$.state` at the next stored row, not at once, so a worker killed in between forgets it. Only a value the D-071 filter would drop depends on it.
- `plugin/hooks/shield.test.ts` "R-12: a check that could not finish hides what it found and warns; hold withholds" takes about 4.3 s against the kit's 5 s limit on this machine, before and after step 8, and timed out once on a slow run. Not changed; watch it in CI.
- Probe tests (`claude plugin test`) don't run in CI. The pinned `claude` now makes that possible; it wasn't added in step 1.
- `claude plugin test` (2.1.316): a `turn.step` stream's `.result` resolves `undefined` even when the step beneath answers, contrary to its doc (`HookStream.result`, `claude-code.d.ts:5383`). Probe tests check the hold through its effects instead. Report it upstream.
- The desktop app's probe log had no `start` line, so its Claude Code version wasn't recorded. Check before release.
- The kit's no-network proof is strongest on Linux, where nothing can leave (loopback-only namespace). On Windows and macOS the proxy trap only sees traffic that honours proxy settings.
- The macOS Keychain call at 1 MB was refused before it ran, and the check doesn't record why. Log the cause when the store limit is measured.
- The probe's `turn.step` hold has no `.catch`, so it fails open. Fine for a test tool; the product's refusing hooks must have one (R-03).
- Check 0.6: a `.catch` that spun the CPU for 2 s still had its answer used, although the documented grace is 1 s. Don't rely on the grace either way.
- Plan step 6 now holds the optional real-API run (moved from step 1, D-027).
- CI's password store and Node steps print evidence but can't fail the job. A change in them only shows if someone reads the log.
- Killing the kit mid-run, or using `--keep`, leaves a scratch folder holding that run's fakes.
- Step 2 rejects 3 Gitleaks rules (D-032): `kubernetes-secret-yaml` stays out (D-038, spec §22); `facebook-access-token` has no required literal; `pkcs12-file` matches file names, not text.
- False alarms on the typescript and @types/node sources (2.9 MB), after step 5: with file names 12 hidden (4.16 per MB); with no file name 159 (55.14 per MB), 76.30 per MB through the pipeline. What is left is TypeScript annotations such as `privateKey: KeyObject;`, a PascalCase type after a label, which looks the same as a letters-only password. The log-like set (`tools/test-sets/logs.ts`) is 214.33 per MB, 136 of 225 hits being 32-hex values after `key=` that Gitleaks' generic rule takes for API keys; many real keys look the same, so they stay. Numbers and the before/after are in `docs/targets.md`.
- With no file name, rules with a path condition still run (D-029), so `hashicorp-tf-password` hides quoted 8 to 20 character values after `password` even in non-Terraform text.
- A hit's area is the pattern's longest match on each side of the keyword. 16 rules reach up to about 32 KB on each side, so about 64 KB per hit; many such hits are bounded by the 4 s budget (`complete: false`), which step 3 must treat as a check failure (R-12).
- `tools/rules/sample.ts` builds random strings from patterns for tests only; they hold no fixed key.
- Unquoted values still end at a space, `;`, `,` or `&` (spec §7.1), so a password holding one is only partly hidden, or missed if the first part is under 6 characters. URL passwords under 6 characters, or holding `/`, are also left alone. A plain lowercase password after a `--flag` is left alone (D-034).
- The truncated-key rule takes the base64 lines after a key as its body, even when the key was complete but JSON-escaped on one line, so a block after it is hidden too.
- The managed run (`npm run leak-test:managed`) and `tests/doctor-managed-real.test.ts` write the machine's managed settings file (D-020), so they run only in CI and have not run on this PC. The first CI run (fad5f1a) failed the managed step on the MCP door (safe mode starts no MCP servers; the script now skips it). The second (897ec0c, run 41313186648) passed everything on Windows, macOS and Linux: the managed safe-mode run (0 of 42 fakes seen, six doors) and `doctor-managed-real` (the plugin reads a real managed file, doctor says Managed). Not seen: the MCP door under managed hooks, and the backup lock in managed safe mode under `observe`. The organization install in `observe` is `npm run leak-test:org-observe` (D-093).
- `npm run plugin:typecheck` needs the API types, which only a loaded mod or the `plugin-authoring` skill provides, so it isn't in CI. `/verify` runs it.
- Large-paste stress runs were by hand, against the kit's mock: 2 MB each, on Windows. No kit door covers them yet.
- A hook killed outright sends its whole row unhidden under the default `allow`, whatever the cause (D-050). Anything that can't check a deadline must be bounded by size.
- A value over 8,192 characters isn't remembered (D-052, spec §22): a bare copy is neither hidden nor blocked, and the person gets a one-time warning. Keeping such values in a side list found by a plain text search would close this with no matcher build, but it reopens D-052.
- A value over 8,192 characters gets a new tag after a worker restart, because D-052 keeps it out of `$.state`. Spec §9 names this exception (D-065). It's cosmetic: nothing gets unhidden. A fix needs a synchronous fingerprint, and the only hash here is async (`store.ts`). Its entry in the `tags` map also stays for the worker's life.
- `exportCatches` skips the catch cap for tagged values the catch list refused: in a scratch run 240,160 characters went to `$.state`, 96,064 of them real catches. Those values never reach the matcher. D-053 caps the export at 4,000,000 characters of JSON, because the host refuses a `$.state` write over 4,194,304. A tagged value past that cap gets a new tag after a restart, which is cosmetic and is the second exception in spec §9 (D-065). The `tags` map itself has no cap, so it still grows for the worker's life.
- Windows reads about 0.5 s per item, so a session with a list spends about 1 s at start, for the index and the list.
- Audit 1 ran before the last fixes. `/security-review` and `/code-review high` covered the step's code, then the too-long warning, the `constructor` fix and D-053 went in, and neither audit was run again on those. They were tested instead: 8 reverts on a scratch copy, each caught by the new tests.
- Closed in step 6: `plugin/README.md` now has the marketplace install line, and `claude plugin validate . --strict` and `./plugin --strict` pass. The one warning left is a missing icon, which only matters for a directory submission.

- Step 5 (backup lock) leftovers: spike S6 (does Claude Code show a settings hook's `systemMessage` or stderr?) was run under `claude -p`, where neither shows, and by hand in the interactive terminal, where a blocked prompt does show ("UserPromptSubmit operation blocked by hook: secret-shield (backup lock) ..."). VS Code and the desktop app were not checked. Node 20 as the lowest Node is a guess: step 6 added a CI job (`backup-node`) that runs the backup lock under Node 20 and 22 on Linux and Windows; read its first result before trusting the floor (Node 20 is also past its end of life).
- `clearLines()` on the checker does nothing since the repeated-line memory was removed (D-074). It stays because many tests and `tools/measure/run.ts` call it; removing it is a cleanup for later. The test titles that named the memory were reworded (titles only).
- The backup lock on Windows with saved secrets starts PowerShell for each hook that acts (about 1 s each, about 2 s per tool call while the main lock is down). A cache would put a hash or a key on disk (R-09). Reported in spec §22, not fixed.
- A value marked harmless for one session only (`/redact allow <tag>`) is not visible to the backup lock; it may refuse what the main lock allowed (spec §22).

- Hand checks run in the interactive terminal on 2026-11-01 (CLI 2.1.316, Windows): `/redact add` saved and hid a value; `/redact add <value>` refused; `/redact learn` found and saved values; a typed paste and a Read of `.env` and `src/config.ts` showed placeholders only; the observe banner showed in the side pane; `/redact doctor` read the backup lock hooks, copy and Node correctly. A second round the same day: the resumed-session hold works (two prompts dropped with "history contains 1 secrets", `/redact allow` lifted it, the next message went through); the backup lock alone, with the plugin not loaded, blocked a prompt holding a token (the message is shown on screen, and Claude Code also echoes the original prompt in that block), let a clean prompt through, and hid the password in a Read result; with the plugin loaded the backup lock stood down and only the main lock acted. The backup log matches the screen (block at prompt, hide at tool-result, tags only). Built, not hand-tested (the owner's call, not an issue): the `outbound: ask` dialog. Its decision logic has hook tests. The model refused the split-token prompt twice (Claude Code's auto mode, then Haiku 4.5), and a later try had it write a token through `Edit`, which is a local tool that `outbound` does not check (`src/core/outbound.ts` LOCAL_TOOLS). A retry needs a command (Bash, WebFetch or a connected tool) that holds a token the model generated itself. VS Code and the desktop app are not tried (VS Code loads a mod through `CLAUDE_CODE_PLUGIN_DIRS` in its process environment, finding 0.10).
- Step 4 was shipped with its hand checks parked by the owner, so "all commands work" is proven in hook tests and `claude -p` runs, not in a real terminal. The hand checks of 2026-11-01 (above) have since covered `/resume`, the add and learn panes and the observe band, all before the rename to AegisContext. Still to run before release: the `outbound: ask` dialog and whether `/redact` survives `/clear` (it is registered again when the session id changes, unproven interactively).
- `tests/media-real.test.ts` skips where the pinned Claude Code isn't installed, so CI's test job may skip it. It ran on Windows only (4 of 4).
- 8 of 120 mutants still survive. Same behaviour, so nothing to test: the `.env` byte order mark (the line pattern's `\s` takes it) and the mention's 8 MiB limit (`$.fs.read` refuses over 4 MiB anyway). Only reachable by running out of time, with no seam to force it: `complete` in `checkOverwrite` once a secret is found, and the "ran out of time" lines in the guard and the mention. Small and untested: a `warn` rule's filter in outbound, the `@` folder early return (the stand-in's read answers where the engine's rejects), and `learnValues.clear()` after a save (values stay in the worker's memory until the next `learn`).
- `claude -p` shows no `$.ui.log` line, so warnings, R-12 failures and the observe banner only reach the log there (spec §22).
- After a mistaken `/redact add <value>`, a scratch run with masking showed the value gone from the next request but still in the transcript file; the real plugin's run found it in no file. The difference wasn't traced, so the message still says to rotate.
- The `@` copy's path holds `secret-shield`, so the model can tell it is a copy. Its Read of the real file is hidden, so nothing leaks.
- A failed store read can take 20 s, and the retry runs inside a hook, so that row waits.
- Step 6: doctor reports the plugin's tier by watching its own `$.command.list()` call pass a `command.list` hook (`next.origin.tier`). A `claude -p` run on 2.1.316 (Windows) printed `Plugin tier: user` with `--plugin-dir` and from a marketplace install, where the debug log says `aegiscontext@aegiscontext` and `next.origin.plugin` holds the bare name. `prepend` was not seen. "Managed" is read from the managed settings holding our `aegisContext` key or enabling our own plugin; `tests/doctor-managed-real.test.ts` checks that against a real managed file in CI, and now also that `prompt.compose` does not reach a user plugin under the real guard.
- The guard warning itself (R-05a) was seen under the real guard for the first time in CI run 41339214316, on all three systems: `$.ui.log` reaches Claude Code's debug log, and the kit requires it in a guarded scenario that sent a request and forbids it in an org run (D-088).
- The guard's Team or Enterprise trigger is measured with a made-up login, not a real account, on all three systems in CI (run 41479307065). The first scratch run on 2026-11-02 (Windows, 2.1.316) put a made-up `.credentials.json` with `subscriptionType` in the run's config folder, with no API key and no managed file. The debug log said "seated outermost: the organization is team" (and `enterprise`), while `pro` and no login stayed unseated. On a scratch copy of the kit, the guarded doors matched `GUARDED_OPEN` (21 of 98: `claude-md`, `hook-context`, `skill-text`), and `hold` refused all three (0 of 21). Those runs are now `npm run leak-test:guarded-login` and `-hold` (D-092): a login makes Claude Code try `api.anthropic.com`, which the proxy refuses and the report marks as expected.
- The backup lock does not cover skill text. A scratch run of the `skill-text` door against the backup lock alone (2026-11-02, Windows, 2.1.316) saw 7 of 7 fakes. The door is in `BACKUP_OUTSIDE`, so `leak-test:backup-limits` proves it on every CI run, and spec §5.2 and §22 and `docs/personal.md` list it. It is a documented limit, not a fix (D-090).
- Audit 2's `/security-review` ran on the staged step 6 code on 2026-11-01 (16:47 UTC): no high-confidence findings. Its one hardening note, the org run's predictable folder name, is fixed (`fs.mkdtempSync`, `tools/leak-test/run.ts`). `/code-review high` ran at 17:49 UTC. Neither saw D-089, and the security review did not see D-087 or D-088 either. Those were proven by the kit in CI instead.
- A wrong `<MARKETPLACE-FOLDER>` was tried with the snippet's settings in a scratch user settings file, not a managed one (D-020): no plugin loaded, and only the debug log said so. The real managed path should behave the same; not measured.
- `--always` on a value whose store save fails stays harmless for the session only, and says so.

- With a failed store read, rows go through with only the shape checks until a retry works, under the default `allow`: a saved secret with no shape is sent, with a warning. Seen on CI when PowerShell took over 20 s in a cut-down environment; a normal environment read in about 0.2 s (D-045).
- The `@` context fallback (engine attaches nothing for the copy) only has a hook test: the short-path case it was written for turned out to need the long path instead.

- Step 6, measured in CI (green on all three systems): `leak-test:org` 0 of 91 fakes, plugin in tier `prepend`; `leak-test:guarded` matches `GUARDED_OPEN` (`claude-md`, `hook-context`; `mention-file` clean; compaction summary held by the resume check); `backup-node` passes under Node 20 and 22 on Linux and Windows. The README install job in `.github/workflows/release.yml` passed on all three systems in run 41342577307, on the tag. The `uninstall-real` run on macOS found that a marker file stays behind after the store is emptied; the documented command now removes the data folder too, and CI passes on all three systems.
- Step 6, not part of this step: the owner's hand checks (VS Code, desktop app and its version, `outbound: ask`, `/redact` after `/clear`), the two weeks of daily use, the real-API run, reports to Anthropic, a trademark register search for AegisContext, the cosmetic items, Anthropic's directory submission (the owner will do it; it needs an icon). The repo is renamed and public, `origin` points at the new name, and private vulnerability reporting is on (checked 2026-11-01). The old `secret-shield` folder is deleted from the owner's PC, so saved values need adding again; its settings had no hooks left.
- Step 6: seven worker kills in one session did not unload the plugin (findings, `budget-repeat-many`); the docs' claim of unloading was not reproduced.

- A value marked harmless with `/redact allow` in this session stays harmless until the session ends, even after `/redact remove` takes its saved entry out (D-091).

- Step 7 shipped without `/verify`, `/security-review` or `/code-review high`: the owner asked to ship and to come back if errors appear. So the audits never saw step 7, nor D-087 to D-089 (see the Audit 2 line). Run both on everything since `2f00d31` before `v0.1.0`.
- Two macOS jobs of CI run 41483714213 (`daf7cab`) were cancelled at 16:55 UTC after 15 minutes queued, with neither started. The owner did not cancel them, and the cause was not found. `test` has `timeout-minutes: 15`, but `leak test` has 20 and went at the same second.
- A path with `\.env` showed as `project.env` in the `/redact` list (most likely Markdown eating the backslash; not checked).
- No signing key exists yet, and the release workflow does not check a tag's signature, so `git tag -v` in the checklist is the only check (D-094).

## Gotchas

Platform and tooling facts learned so far (from the old `lessons.md`).

- Rows loaded by `/resume` don't pass through `session.append`, so a resumed session can resend raw secrets (spec §6.1, check 0.3).
- A mod can't change messages already sent. Registering a secret mid-session can't un-send it, so warn and suggest rotating (§6.2).
- Hooks fail **open**: a throw, a wrong shape or going over 10 s means the hook is skipped. Refusing hooks need `.catch` (1 s grace) to fail closed (R-03).
- Under `allowManagedHooksOnly`, a project's `disableAllHooks`, `--safe-mode`, `--bare` or `CLAUDE_CODE_SIMPLE=1`, a user-tier plugin loads no hooks and user settings hooks don't run. A plain markdown command still loads (checks 0.7, 0.8, 0.14).
- The mod runtime has no Node or DOM; everything goes through `$`. A mod and its imports must sit inside the plugin folder, so `src/checker/` gets copied or bundled into `plugin/` (step 3).
- Git for Windows sets `core.autocrlf=true`; `.gitattributes` forces LF. Test CRLF on purpose with fixtures built in the test. Count line endings with Node or `git ls-files --eol`, not `grep`.
- `claude plugin test`: a test's own `session.append` hook that answers without `next` gets skipped, so record rows with `mock.session(on)`. A hook for a `$` call that throws makes the plugin's call reject, which is how to simulate a failing write. Not for `$.state`: the kit has its own store beneath the hook, so a throw is skipped and the write succeeds. Send it a value over 4,194,304 characters through `next` to get a real refusal.
- `claude -p`: put the prompt before `--allowedTools`, which takes several values and swallows what follows.
- `$.fs.write` replaces the whole file.
- A mod may pass `$` only to functions declared or imported at the top of a file (not to one passed in as a parameter), and may register each event only once without a matcher. Both are load errors, which `claude plugin validate` and the tests show; type errors only show with `tsc` and the tsconfig from the types file header.
- The plugin runtime's `crypto.subtle` has `digest` only: no AES (check 0.4).
- Hook time: waits on `$`/`next` don't count; `$.clock.sleep` does; CPU-bound code is cut off at about 6 s (check 0.6).
- Test runs against a mock: use `ANTHROPIC_BASE_URL`, a dummy `ANTHROPIC_API_KEY` and a separate `CLAUDE_CONFIG_DIR`, never `--bare` (it loads no plugin hooks). Without a separate config dir, runs leave records in your real `~/.claude`.
- JavaScript `String.replace` treats `$&`, `` $` `` and `$'` in the replacement as patterns. When a replacement holds Markdown with `$`, pass a function: `t.replace(from, () => to)`.
- The VS Code extension runs its own Claude Code version (2.1.314 next to CLI 2.1.316).
- When Claude Code loads a mod (VS Code, desktop app, an interactive session), it writes `tsconfig.json` and `.claude-plugin/types/` into the mod folder. Delete them after a test run; the types folder is gitignored, the `tsconfig.json` is not.
- When a skill asks for plan approval, the answers to design questions are not approval. Ask for approval explicitly.
- `npm i --ignore-scripts @anthropic-ai/claude-code` leaves `bin/claude` as a stub. The real binary is in the platform package, for example `claude-code-win32-x64/claude.exe`, and runs directly.
- Connected (MCP) tools are deferred: they aren't in the request's tool list, but a scripted call by name works.
- Project `CLAUDE.md` text reaches the model in `messages`, not `system`. `messages` can also hold `system`-role entries.
- Without `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `claude -p` tries `api.anthropic.com:443` even with `ANTHROPIC_BASE_URL` set. Marketplace auto-install has its own switch (docs: env-vars).
- OS password store limits (check 0.4): `secret-tool` and `security -i` take about 1 KB safely, not 64 KB. DPAPI took 1 MB.
- A mutation check means nothing unless the unmutated tests pass first. Run it with a control, on its own, and with its own temp folder: a mutant that keeps scratch folders fills the real one.
- A running regex can't be interrupted, and the mod has no timeout. A time budget only works between calls, so a pattern's worst case must be bounded per piece of text, not per start position.
- The scan's time budget also covers the keyword pass, so a test needs a budget longer than that pass or no rule ever starts (about 60 ms on 2 MB).
- A multi-line script with backslashes and backticks can break in a shell heredoc. Write it to a scratch file and run that.
- `tests/no-whole-fakes.test.ts` only searches tracked files, so new files pass it until they are staged. `/verify` should run it after `git add`.
- Updating Gitleaks: remove the `gcp-api-key` allowlist from the new copy again (D-039).
- A hook's deadline only covers work that checks it. A matcher build, a regex and any loop that doesn't check the clock run to the end, and a worker killed at about 6 s sends the row unhidden. Size-bound them.
- A test with one fake can miss what several kinds do together: only a run with the kit's full block found the private-key case. Stress with all of them.
- In a shell chain, a `sed` that matches nothing still succeeds. Check a test run's result, not the commands before it, before committing.
- `npm run plugin:typecheck` needs the types path, and the skill's copy moves: `%TEMP%/claude/bundled-skills/<version>/<hash>/plugin-authoring/types/claude-code.d.ts`, where the hash changes. Find it with a wildcard, not a saved path.
- To learn whether a command ran, parse the transcript's messages. A raw text search also matches the search itself once it is in the transcript.
- The Bash tool on this Windows machine breaks a heredoc holding apostrophes or `\n`. Write scripts with the Write tool.
- Under `claude plugin test`, the test's own `$` and a test hook's `$` can't call nouns the test module doesn't use, and `$.command.run` carries no origin unless the test passes one.
- A helper taking `$` must be a function declaration: a `const` arrow is a load error, as the store's `today` showed.
- The kit passes a short list of env variables, and `OS` isn't on it. Code that reads the environment needs a test under the kit.
- The engine refuses a Windows short name such as `RUNNER~1` for an `@` read. CI's temp folder has one, this PC's doesn't. Pass `realPath`.
- PowerShell needs `PSModulePath`, and `secret-tool` the D-Bus address: a cut-down environment makes the store fail in ways a normal one doesn't.
- A regex typed through `sed` can lose its escapes and still run: `/^file:///` became a regex plus a comment.
- `$.fs.read` rejects a file over 4 MiB, so a `try` around it can turn a big file into an empty one.
- A `.catch` on a stream is different: `next` there opens a new stream, so `turn.step`'s would send the request again. Throw instead.
- A review finding pasted into a new session only carries what was pasted. Two "record it" items from one session never reached the docs that way.

- A test or script that starts `claude` from the same Node process that runs the mock API must use async `spawn`: `spawnSync` blocks the event loop, so the mock never answers and the run hangs until its timeout. Also pass `stdio: ['ignore', ...]`, or `claude -p` waits on stdin.
- `$.process.run(["node", ...])` refuses a PATH with an empty entry ("unsafe location (current directory)"), though a settings hook starts `node` from it. Look through the PATH folders instead (D-079).
- A blocked prompt is echoed back on screen under `claude -p` (spike S4), and a hook's `systemMessage` and stderr show nowhere there (S6). A kit run reads a block from stdout, and a warning is only in the log.
- The backup lock's log is `<date>-<session>.backup.jsonl`, a file of its own beside the main lock's, and it holds one JSON object per line, so a text search for a quoted value must parse the line (the managed proof does).
- A deep tool-response value, a 4 MiB text and a 16 MiB stdin each have a limit in the backup lock; a test for a limit needs a value past it, not near it.
- `claude --safe-mode` starts no MCP servers (its help says so), so an MCP door has no witness in a safe-mode run and the kit calls it INVALID. The managed safe-mode script runs the other six doors.
- `Read`, `Write`, `Edit`, `NotebookEdit` and the task tools are local tools that `outbound` does not check (`LOCAL_TOOLS`, `src/core/outbound.ts`). To see the `outbound` dialog by hand, a Bash, WebFetch or connected-tool call must carry a token the model wrote itself; models refuse a split-token prompt.
- In the interactive terminal, Claude Code echoes a prompt the backup lock blocked in full ("Original prompt: ..."), so the blocked secret is on screen and may reach its transcript.
- Under `claude plugin test`, a pane stays mounted after the plugin closes it: `unmount()` it before mounting the same pane again.
- A hold test that reaches `turn.step` must fire `prompt.compose` first, or it reads as a guarded machine and is refused (D-087).
- A `turn.step` hook that answers without `next` must stream a `text` and a `stop` chunk. The engine reads the stream, not the return value; a bare return exits 1 with "Execution error" (D-087). `claude plugin test` does not show this, only a real run does.
- `$.ui.log` lines reach Claude Code's debug log (`--debug-file`) even under `claude -p`, where the screen shows nothing.
- `$.ui.log` and `$.ui.toast` lines already show the plugin's name (`claude-code.d.ts`, `plugin.name`, `ui.toast`), and so does slash-command text in the terminal, so text there must not start with it (`tests/log-prefix.test.ts`). A `deny`, a `drop`, a dialog and the banner show no name, so they keep theirs.
- Under `claude plugin test`, a test and the plugin hold separate module copies, so a test can't reach a plugin module's variable. Prove it through a hook: a `state.get` hook answers `{ value: { value, version } }`, and a command row exercises the mask.

- A CI job waiting for a machine reads `queued`, not stuck: nothing has run. `gh run rerun <id> --failed` restarts only failed or cancelled jobs, under a new attempt.
- `tests/no-whole-fakes.test.ts` needs staged files, so `git add -A` then `git reset -q` shows in the reflog as "reset: moving to HEAD". It moves no commit, but it does unstage whatever was staged.
- A signed tag does not cover the archives. A `.tar.gz` rebuilt from the tag matches `SHA256SUMS`, which ties them together; a `.zip` does not.
- Claude Code's Edit error for text that matches more than once ends with `String: <old_string>`, the same as "not found" (2.1.316 binary), so either failure echoes what the hook passed in.
- `claude -p "/redact ..."` with no mock retries the API for minutes and prints no result. To see a command's answer in a real run, point it at the kit's mock.

## Session notes

Newest last, 3–5 lines each: what exists now and what the next session needs.

### 2026-10-31: setup and part 0.0
- npm + `package-lock.json` (dev deps only: `typescript@7.0.2`, `@types/node@24.19.2`); `node:test` runs `.ts` directly on Node 24 (`.nvmrc`); `tsc -p .` typechecks only (`erasableSyntaxOnly`: no enums or namespaces). `LICENSE`, `NOTICE`, `.gitattributes`, 3-OS CI with SHA-pinned actions, guard tests in `tests/repo-setup.test.ts`.
- Remote: `origin` = https://github.com/Mrinanka/agent-redact.git; `develop` is the default branch. CI run 41203340159 green on all 3 OSes.
- The root tsconfig excludes `plugin/` and `experiments/`. Relative imports in tests use the `.ts` extension.

### 2026-10-31: part 0.A (probe)
- `experiments/step0-probe/` writes one JSON line per `session.append` row (metadata only) to `<cwd>/.step0-probe/<session id>.jsonl` (D-016, D-017). 10 tests under `claude plugin test`, including a planted fake that must appear in no write.
- Verified on 2.1.316, Windows, `claude -p` only: 17 rows over 5 doors.

### 2026-10-31: workflow slimmed
- 44 parts became 7 steps; 7 commands became 3 (`/plan-step`, `/verify`, `/ship`); 2 audits (D-018). Scope cuts parked in spec §23 (D-019). `lessons.md` folded into "Gotchas" above.

### 2026-10-31: step 0 checks
- `experiments/step0-mock/`: local mock API (`server.ts`), driver (`run.ts`, scenarios in `scenarios.ts`), hand-run helper (`manual.ts`). `experiments/step0-settings-hooks/hook.mjs`: settings hook for 0.8/0.9/0.13/0.14. The probe gained opt-in checks (`on-<name>` markers) and a markdown command.
- All checks 0.1–0.14 recorded in findings (0.4 and 0.13 partly, Windows only). Spec updated (D-022); secret store now uses the OS password store (D-023, supersedes D-004).
- Mods: `$` may only be passed to functions declared or imported at the top of a file, and each event may be registered once without a matcher. Type-check mods with the tsconfig from the types file header; `claude plugin validate` doesn't catch type errors.
- Owner ran the interactive terminal, VS Code, desktop app and managed-mode checks by hand; all test leftovers outside the repo were deleted afterwards.
- Next session needs: step 1 (test kit). Reuse `experiments/step0-mock/server.ts` as the start of `tools/leak-test/`; install `claude` in CI to finish 0.4 and 0.13 on macOS and Linux.

### 2026-10-31: step 1 (test kit)
- `tools/leak-test/`: mock (`server.ts`), search (`detect.ts`), proxy trap (`trap.ts`), 14 doors (`scenarios.ts`), core (`kit.ts`), CLI (`run.ts`), with Claude Code pinned in `claude-pin/` (D-024 to D-026). `tools/test-sets/`: fakes, catch, code, false-alarm and speed sets, for step 2 to measure against.
- Baseline: 98 of 98 fakes seen on Windows, macOS and Linux, and on Linux with no network; 0 network attempts (CI run 41217109599; two kit fixes after it are covered by the PR's CI). 152 tests in `npm test`, 30 under `claude plugin test`.
- Checks 0.4, 0.11 and 0.13 finished. The store limit in 0.4 means spec §8.1 needs a decision before step 3 (Known issues).
- Next session needs: step 2 (checker). Pin Gitleaks (v8.30.1 was read, `83d9cd68`, 222 rules), create `THIRD_PARTY_LICENSES`, and measure against `catchSet()`, `codeSet()`, `falseAlarmFiles()` and `speedSet()`.

### 2026-10-31: step 2 (checker)
- `src/checker/` (no Node imports, guarded by a test): `re/` (RE2 parser, analyzer, JS emitter), `convert.ts`, `aho.ts`, `entropy.ts`, `labels.ts`, `harmless.ts`, `private-key.ts`, `lines.ts`, `checker.ts`. `createChecker({ off, actions, custom, budgetMs })` returns `{ checker, errors }`; `checker.scan(text, { file })` returns `{ findings, complete }`.
- `npm run rules:build` (`--check` in CI) turns `third_party/gitleaks/gitleaks.toml` (v8.30.1) into `rules.generated.ts`: 219 converted, 3 rejected (D-028 to D-032). `npm run measure` prints the numbers; it is a CI step.
- `/verify` found 2 blockers (a stuck custom pattern, a crash at about 3 MB) and several leaks; all fixed with tests in `tests/checker-hardening.test.ts` (D-032 to D-035).
- Numbers: catch 124 of 124 in the contexts counted (14 decoder cases left for step 3); code set 41 of 41 left alone, 81 of 81 twins hidden; speed under Node: 2 MB log about 85 ms, 2 MB one-line JSON about 90 ms, worst adversarial item about 350 ms.
- Decisions D-028 to D-039. The store design is settled in D-036, with spec §8.1 edited in step 3 after measuring macOS and Linux. `personal_data` moved to step 5 (D-037); `kubernetes-secret-yaml` stays rejected (D-038, spec §22).
- Next session needs: step 3 (core hiding). Copy or bundle `src/checker/` into `plugin/`, treat `complete: false` as a check failure, show "not available yet" for `personal_data: on`, and prove the checker in a real hook.

### 2026-11-01: step 3 (core hiding)
- `src/core/`: `forms`, `matcher`, `decoder`, `placeholder`, `session` (Redactor), `rows`, `settings`, `log`, `note`, `store`, `backends`. `plugin/`: 7 hooks with `.catch`, and `hooks/lib/`, a copy made by `npm run plugin:build`, with the licences beside it. Checker additions: `ScanOptions.budgetMs`, `convertAllowPattern`.
- `/verify` found real leaks, all fixed with tests in `tests/core-hardening.test.ts`: a flood of placeholder starts, misaligned or indented base64, odd hex, non-ASCII passwords, a blocked value losing its block, and a 2 MB base64 paste that killed the worker through a 5 s matcher build (D-051, D-052).
- Store measured in CI (D-045). CI run 41242945288 on wip `330d4fd`: all 6 jobs green, leak-test:core 0 of 84 seen on 3 OSes. Later changes are in the working tree, for `/ship`.
- Numbers: catch 135 of 138 (D-046), code set 41 of 41, false alarms 5.55 per MB with a file name.
- Decisions D-040 to D-053. Next: `/security-review`, `/code-review high`, `/ship`.
- A review found a project rule with the id `constructor` could undo a user's or a locked managed `block`, and a project could weaken a rule with that id; fixed with own-key lookups. A refused `$.state` write now warns, logs and retries, and the export is capped (D-053). The locked-store gap is in Known issues, for step 4.

### 2026-11-01: step 3 audit and ship
- Audit 1 is done: `/security-review` found nothing at confidence 8 or above, and `/code-review high` gave 7 findings. Findings 1 and 3 are recorded, 2 is fixed, and 4 to 7 are rejected (D-054). Of its 4 low-confidence security notes, `constructor` is fixed and the other 3 are in Known issues. Checking them also found the `$.state` failure (D-053).
- On the tree shipped, on Windows: 678 of 678 in `npm test`, 28 of 28 in `claude plugin test`, typecheck and plugin typecheck clean, `leak-test:core` 0 of 84 seen over 12 doors with 0 network attempts. macOS and Linux results for this tree are on the step 3 PR's CI.
- Next session needs: step 4. Fix the locked-store gap before `/redact add` ships (Known issues), and decide the self-protection question there.

### 2026-11-01: step 4 (rest of the main lock)
- New in `src/core/`: `outbound`, `guard`, `protect`, `envfile`, `versions`, `media`, `selfcheck`. New in `plugin/hooks/`: `tools`, `mention`, `resume`, `commands`, `panes.tsx`, `banner.tsx`, `state`; `plugin/commands/doctor.md`. Kit: `heldMessage`, `STORE_SCENARIOS`, plugin log lines on stderr.
- Decisions D-055 to D-062. The approved test change is `tests/core-settings.test.ts` (media and observe no longer "not available yet").
- CI run 41289370109 on `c8f0aa8`: all 6 jobs green; every door 0 of 105 on 3 OSes; baseline 98 of 98; locked Keychain and keyring warn. Six wip pushes instead of the one planned, each fixing what the last run found.
- Next: `/verify`, the hand checks in Known issues, `/ship`.

### 2026-11-01: step 4 tests, fixes and mutation checks
- The planned tests that were missing are in `plugin/hooks/lock.test.ts` and the new `tests/media-real.test.ts`. They found real bugs, all fixed (D-066, D-067): the guard passed silently on an unreadable or over-4-MiB file, `tool.check` and `session.compact` failed with no warning, `tool.call` logged `allowed` when it denied, self-protection missed a new file through a linked folder and a linked config folder, a missing `@` path counted as a failed check, and observe could hold. `turn.step` now has a `.catch`.
- 120 mutants on a scratch copy: 72 killed at first, 40 of the 48 survivors killed by new tests, 8 left (Known issues).
- The owner's three step 3 leftovers are settled: D-063, D-064, D-065. Spec §9 and §22 updated; §22 also gained a line for forged placeholders, so the limit is written down.
- On this tree, Windows only, uncommitted: 737 pass and 1 skipped of 738 in `npm test`, 129 of 129 in `claude plugin test`, typecheck and plugin typecheck clean, `claude plugin validate` passes, leak test 0 of 105 over 15 doors, 0 network attempts. macOS and Linux have not seen these changes; CI will on the next push.
- The owner parked the hand checks and shipped. Next session needs: step 5; the hand checks stay open in Known issues.

### 2026-11-01: step 5 (backup lock and tuning)
- Spikes S1 to S6 first (findings, Notes); S1 changed the plan: failed commands are outside the backup lock (D-072), three hooks not four. Built: `src/backup/` compiled to `plugin/backup/` (`npm run plugin:build`), `/redact backup`, the marker `beat` (D-077), `personal_data`, the snippets, kit options (`--backup`, `--outside`, `--safe-mode`, `--allow-managed-file`).
- Tuning and targets (D-071, D-074, D-075, D-078): no-file-name false alarms through the pipeline 350.28 to 76.30 per MB, log-like text 404.8 to 214.33; catch 135/138, code set 41/41, twins 81/81. Numbers in `docs/targets.md`.
- Checked: local tests, typechecks, validate, `claude plugin test` (144), leak tests (backup 0 of 49 seen, limits 42 of 42 seen), and CI on 3 OSes (run 41319320239, six jobs green). The first CI run failed only on the MCP door under safe mode (script now skips it).
- Hand tests in the terminal: add, learn, paste and read, observe banner, resume hold, backup lock alone and standing down all passed. They found the `/redact learn` short-value bug (fixed, two tests). Parked by the owner: `outbound: ask` dialog (built, not hand-tested), VS Code, desktop app. Decisions D-068 to D-080.
- Next: step 6 (release) from `develop` after the merge; `/security-review` and `/code-review high` before its `/ship`.

### 2026-11-02: outside review checked, step 6
- Every finding was checked against the repo, the 2.1.316 binary, the CI log and scratch runs. Fixed: `hold` refuses a guard pass-over (D-087); the warning names hook context, reaches the log and is proven by the kit; the docs' "and with"; the org run builds from a real archive (D-088). New: `npm run leak-test:guarded-hold`, `--hold` on the kit, a CI step.
- The owner approved the test changes: `tests/guard-check.test.ts`'s word list, and `prompt.compose` setup in two `lock.test.ts` tests.
- A real run against the mock found that a `turn.step` hold must stream its answer; the two older holds had the same bug, and all three are fixed (D-087).
- The owner reported `/code-review high` and `/verify` complete and asked to ship. `leak-test:guarded`, `:org` and `:guarded-hold` first run on this code in the PR's CI.
- Next: the owner merges, then the release steps in `docs/release-checklist.md`.

### 2026-11-02: skill text, after the ship
- PR #7's first CI run was green on all three systems (run 41339214316): org 0 of 91, guarded 14 of 91, guarded-hold 0 of 14; the warning was seen under the real guard. A push and its PR share a concurrency group, so the push run shows as cancelled.
- The owner asked for skill text to be fixed before the merge (D-089): the warning, refusal, doctor line, docs and spec name it, and the kit's `skill-text` door measures it. With the door, org and guarded each cover 14 doors and 98 fakes, and hold 3 doors.

### 2026-11-02: release candidate, and progress caught up
- PR #7 is merged. `release` equals `develop` at `3e76836` and is the default branch; `v0.1.0-rc.1` points there. Release run 41342577307 passed everything, README install included, and made a draft pre-release with the archives and `SHA256SUMS`. The draft is not published.
- Audit 2 is recorded in Known issues: what ran, when, and what came after it.
- A scratch run measured the backup lock on skill text: 7 of 7 seen (Known issues). Nothing in the repo changed for it.
- Next: the owner's hand checks, for which they will ask Claude for instructions first; the two weeks of daily use; then the rest of the "Before `v0.1.0`" list.

### 2026-11-02: step 7 (fixes before daily use)
- Built on `step-7`: skill text in the backup lock's limits, the doubled name, `--login` and `--observe` on the kit, `/redact remove` (D-090 to D-093). The owner approved one test change: `shield.test.ts:100` searched for the name to prove a warning, and now searches for the warning's words.
- Corrected an earlier claim: a removed value stops being hidden at once, not at the next session.
- CI run 41479307065 on wip `d22943d`: all 10 jobs green on Windows, macOS and Linux. `leak-test:org-observe` 98 of 98 seen; `guarded-login` 21 of 98, the same as the managed guard; `-hold` 0 of 21; Enterprise 7 of 7 at `skill-text`; `backup-limits` 49 of 49; `leak-test` 0 of 112. The login run works on macOS too.
- `/redact remove` is proven in hook tests and refuses correctly under `claude -p`, but its pane has not been seen in a real terminal. The doubled name is gone in tests and the debug log, not yet seen on an interactive screen. Both are in the hand checks.
- Next: `/verify`, `/security-review` and `/code-review high` on everything since `2f00d31`, then `/ship`.
- Signed tags decided (D-094): GPG, from `v0.1.0-rc.2` on. The owner makes the key; no release until then. The docs sweep also fixed the README table, the count in `docs/verify.md` and the rc.1 labels, and closed the lowest-version hunt. `tests/docs.test.ts` now fails if the README table misses a subcommand.
- The owner asked to ship before `/verify` and the audits, with CI on Windows and Linux green for `daf7cab` and all systems green for `d22943d`.
- Next: the owner merges, then their step 8. Before `rc.2`: the audits, a GPG key, and the fingerprint in `SECURITY.md`.

### 2026-11-02: step 8 added
- Step 7 is merged (PR #8). The owner added step 8: put secrets back, the weekly run against the newest Claude Code, and Audit 3 (D-095). `rc.2` moved to after it.
- The put-back design is in `docs/plan.md`, "Step 8", and D-096, which stays `proposed` until the rewrite test passes. The spec, README and `docs/personal.md` don't change until then.
- Next: `/plan-step` on `step-8`. Not `/ship`: nothing is built yet.

### 2026-11-02: step 8, phase A (rewrite test)
- Built on `step-8`: the scratch mod `tools/leak-test/fixtures/rewrite-plugin/`, `tests/rewrite-real.test.ts` (rewrite and hide, a control with no rewrite, a failed Edit), a CI step in `leak-test` with a guard in `tests/leak-ci.test.ts`, and spike S7 in `docs/findings-step0.md`.
- CI run 41498877655 on `ef5e4c8`: macOS and Linux passed; Windows failed because the runner's temp folder has an 8.3 short name (`RUNNER~1`) and Claude Code refused the Write as outside the working folder. A test bug, reproduced locally with a short temp path; the test now uses the real path.
- CI run 41501087930 on the fix: all 10 jobs green, so the rewrite works on all 3 systems. D-096 stays `proposed` until phase B.
- Not done yet: phases B to F (rules, feature, kit, weekly run, docs, Audit 3).
- Next: phase B. It edits the spec and decision log, so the owner says yes first.

### 2026-11-03: step 8, phase B (rules)
- D-096 is `accepted` with the owner's details (copy limit, a lost secret goes through, the extra note only when on, a failed Edit stays as written, Write and Edit only). D-006 is superseded; D-049 notes the `put_back` exception.
- Spec §1, §2, §5.1, §9, §10 (with the who-decides table and new R-18), §14, §15, §22, §23 and R-09, R-11 changed. `CLAUDE.md` disk rule, the plan's step 8 items and its "never just latest" rule, and the "stricter only" lines in the README and `docs/personal.md` changed. `npm test`: 1020 pass, 2 skipped, 0 fail.
- Still to do in phase F: the full put-back section of `docs/personal.md`, `managed.md`, `troubleshooting.md`, `verify.md`, the changelog and the command table.
- Next: phase C (the feature, tests first).

### 2026-11-03: step 8, phase C (the feature)
- Built: `src/core/putback.ts` (who decides, the choice file, `restoreInput`), `Redactor.keepHidden` and hit sources (only when asked for, `sources: true`), `put_back` in `src/core/settings.ts`, `PUT_BACK_NOTE` in `src/core/note.ts`; in the mod `plugin/hooks/putback.ts`, the restore step in `tools.ts` (order: protect, outbound, restore, guard, one shared 3,000 ms deadline), `/redact put-back [on|off] [--here]`, the status and doctor lines, and the extra compose section (fixed at the first compose of a session). `plugin/hooks/lib` and `plugin/backup` rebuilt.
- Tests, written before the code except as noted: `tests/core-putback.test.ts` (36), `tests/core-settings-putback.test.ts`, `tests/core-note.test.ts`, `tests/backup-putback.test.ts`, `plugin/hooks/putback.test.ts` (24, real hooks in the kit). The small `keepHidden` and hit-source changes in `session.ts` were written just before their tests.
- Results: `npm test` 1075 tests, 0 fail, 2 skipped; `npm run typecheck`, `plugin:typecheck`, `plugin:build -- --check`, `claude plugin validate` pass; `claude plugin test ./plugin` 205 of 205 (`shield.test.ts` "R-12: a check that could not finish..." takes about 4.3 s against its 5 s limit, with and without this change; it timed out once on a slow run).
- Decisions made while building, for the owner to see: a NotebookEdit is never restored and its guard still blocks even with put-back on (spec §10); `/redact put-back` also works under `claude -p` (it writes paths only); a restored value is added to the catch list so a bare copy stays hidden (D-071's letters-only filter does not apply to it).
- Not done: phases D to F (the kit's `--put-back` runs, the weekly run, docs, Audit 3).
- Next: phase D.

### 2026-11-03: step 8, phases D to F (kit, weekly run, docs)
- Kit: `Scenario.tools`, `expectFiles` and `cleanFiles`, five put-back doors (`putback-write` with a `/compact` and a resume, `-edit`, `-failed-edit`, `-new-file`, `-subagent`), `--put-back on|off` (writes the choice file into the run's config folder), `npm run leak-test:put-back` and `leak-test:put-back-off`, and two CI steps. Real runs on 2.1.316, Windows: 20 doors each, 0 of 140 fakes seen, on and off; the file comes out whole with it on and untouched with it off. CI runs them on the three systems (not yet seen).
- Weekly: `.github/workflows/weekly.yml` (schedule, `workflow_dispatch`, `push` on its own path; 3 systems; `contents: read`; newest Claude Code with scripts off; version printed first; validate, plugin tests, baseline, rewrite test, every door, put-back on and off, backup, backup limits, Team login). Not run yet: it needs the push.
- Docs: `personal.md` (the risk, keep it off, the table), `managed.md`, `troubleshooting.md`, `verify.md`, `tested-versions.md`, `release-checklist.md`, `CHANGELOG.md`, the README command table, `plugin/README.md`.
- Checks: `npm test` 1094 tests, 0 fail, 2 skipped; typecheck, `plugin:typecheck`, `plugin:build -- --check`, `claude plugin validate`; `claude plugin test ./plugin` 205 of 205; `leak-test:baseline` 105 of 105 seen; `leak-test:backup` 0 of 49; `leak-test:backup-limits` 49 of 49.
- Not done: the CI run on the three systems, the weekly run on `step-8`, and Audit 3 (the owner runs `/security-review` and `/code-review high` on everything since `2f00d31`). Nothing is committed: the owner asks for a wip commit or `/ship`.
- Next: the owner commits a wip checkpoint (or I do when asked) so CI and the weekly run can go, then `/verify`, then Audit 3, then fixes, then `/ship`.

### 2026-11-03: step 8, `/verify`
- CI on `22b1f6e`: run 41516399013, all 10 jobs green. Weekly run 41516399074, green on 3 systems, but it installed 2.1.316, the same as the pin, so it has proven the workflow and not a newer Claude Code.
- `/verify` found an Edit whose text matches twice would be restored, and Claude Code's "several matches" error repeats it (nothing leaked: stored-row hiding removes it). Fixed with the owner's yes: spec §10, D-096 item 4, two tests written first and seen failing. Uncommitted. CI has not seen this fix.
- On that tree, Windows: `npm test` 1096 tests, 0 fail, 2 skipped (both need CI's setup); `claude plugin test` 206 of 206; typecheck, `plugin:typecheck`, `plugin:build -- --check`, validate pass; `leak-test:put-back` and `-off` 0 of 140 each; `tests/rewrite-real.test.ts` 3 of 3 (before the fix, which does not touch it).
- Owner's calls: a broken managed block stays as it is (D-097); `put_back` keeps its own section in `docs/personal.md`, so `tests/docs.test.ts` does not change.
- Not done: the two small fixes in Known issues, Audit 3, then `/ship`. Audit 3's scope is `2f00d31..HEAD`. `origin/HEAD` here points at `develop`, which already holds 10 of those commits, so a run on the branch's own changes would miss steps 6 and 7.

### 2026-11-03: step 8, ship
- The owner asked to raise the PR before Audit 3 and before the two small fixes. Both stay open in Known issues, so the step is not ticked. D-097 records the broken managed block.
- Next: the owner runs the audits on the PR; fixes go on `step-8`; then the merge, the GPG key and the rest of "Before a release candidate" in `docs/release-checklist.md`.
