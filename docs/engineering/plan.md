# Plan: building AegisContext

How we build the tool described in `spec.md`, and how we prove it works.

- **Status:** draft.
- **Last updated:** 6 November 2026 (steps 9 and 10, D-107, D-106; step 8, D-095, D-096; step 7, D-090; signed tags, D-094; earlier: step 3 hooks, D-042; 7 steps, D-018; scope cuts, D-019).

---

## The approach in short

1. **Test first.** Build the leak tests before the features, so every feature is proven the day it's added.
2. **One checker, one language.** v1 is written entirely in TypeScript. The main lock and the backup lock use the same checker, so they always agree.
3. **Measure, don't assume.** Speed, catch rate and false alarms are measured and published.
4. **Anyone can repeat our tests.** Every test we run, an adopter can run on their own machine, with no API key and no network.

## The 7 steps

One step = one session: `/plan-step` → approve → build → `/verify` → `/ship` (PR into `develop`). Branch `step-<n>`.

| Step | What | Done when |
|---|---|---|
| 0 | **Facts** about Claude Code | Every kept check has a result in `findings-step0.md`; findings applied to the spec; no [Step 0] blocker left |
| 1 | **Test kit** | Against the empty tool, every planted fake is reported leaked; CI runs it on 3 OSes |
| 2 | **Checker** | Every rule compiles or is rejected with a reason; code set fully unhidden; catch, false-alarm and speed numbers printed |
| 3 | **Core hiding** (store, decoder, plugin, `session.append`) | Leak test clean for prompt, Read, Bash, errors, MCP, subagent, compaction. **Audit 1.** |
| 4 | **Rest of the main lock** | Leak test clean for everything v1 covers; all commands work; `claude plugin validate`/`test` pass |
| 5 | **Backup lock + tuning** | Safe-mode leak test passes within the backup lock's limits; targets set, written down and met |
| 6 | **Release** | A newcomer installs and verifies from the README alone. **Audit 2.** |
| 7 | **Fixes before daily use** (added after `v0.1.0-rc.1`, D-090) | The backup lock's limits name skill text; `/redact remove` works; no doubled name; the login and observe runs pass in CI. |
| 8 | **Put secrets back + weekly CI + Audit 3** (added after step 7, D-095) | The rewrite test passes, or the design is changed and approved; put-back works by the settings table, and the leak kit stays clean with it on and off; the weekly run is green; the audits are done; `v0.1.0-rc.2` can be tagged. |
| 9 | **Version warning in doctor only** (D-107) | A session start with a version not on the tested list shows nothing; `/redact doctor` shows the version with a report link and lists no fix for it; R-01, the tests and the docs say the same. |
| 10 | **Put-back anywhere + Audit 4** (D-106) | The auto-mode probe passes, or the design is changed and approved; with put-back on, this session's placeholders are restored through Write, Edit and Bash; the leak kit stays clean with it on and off; the audits are done. |

**Audits** (steps 3, 6, 8 and 10, before `/ship`): built-in `/security-review` and `/code-review high` on the step's diff.

## Ground rules

- **Gitleaks rules:** copied into the repo at a fixed version, reviewed, credited in `THIRD_PARTY_LICENSES`, and updated on our schedule, never automatically.
- **Dependencies:**
  - None at runtime.
  - Build and test tools are dev dependencies, pinned with a lockfile.
- **Testing:** done against a fixed Claude Code version, never just "latest". One exception: the weekly CI run (step 8) uses the newest version as an early warning. It proves nothing for a release.
- **CI:** GitHub Actions on macOS, Windows and Linux, with actions pinned to commit IDs (not tags).
- **Releases:** semantic versions, SHA-256 checksums, and tags signed by the maintainer from `v0.1.0-rc.2` on (D-094).
- **Fake secrets only:** built at test time from pieces, never written whole in a file.

---

## Step 0: Facts

The design depends on how Claude Code behaves. Some of it was confirmed by reading the mod API types in Claude Code 2.1.316. The rest must be confirmed by running it. All of this works on a personal computer.

Done so far: repo setup (old 0.0) and the probe mod `experiments/step0-probe/` (old 0.A).

| # | Check | Why it matters (spec section) |
|---|---|---|
| 0.1 | `session.append` sees every row: prompt, tool result, failed-command error, `@` attachment, compaction summary, subagent rows | All hiding depends on it (5.1, 6) |
| 0.2 | A **user-tier** plugin's `prompt.mention` hook can redirect an `@` file to a redacted copy | Closes the Personal-mode `@` gap (5.3) |
| 0.3 | `/resume`: what is sent, and can a plugin read the loaded history before the first request? | Resume protection (6.1, R-06) |
| 0.4 | The mod runtime has WebCrypto (AES-GCM, secure random), and `$.process` can call `security`, PowerShell DPAPI and `secret-tool` | Secret storage (8.1, R-10) |
| 0.5 | Image and document blocks can be dropped at `session.append` | `media: drop` (6) |
| 0.6 | A hook over 10 s is skipped; a `.catch` handler gets 1 s; what happens after repeated worker crashes | Failure handling (12, 17) |
| 0.7 | Under `allowManagedHooksOnly`, a user-tier plugin loads no hooks, and how the tool can detect that | `doctor`, R-05 |
| 0.8 | In safe mode, settings hooks (the backup lock) still run | Backup lock (5.2) |
| 0.9 | Settings hooks can change a tool's input (`PreToolUse`), and whether they can rewrite a built-in tool's output (`PostToolUse`) | Backup lock limits (5.2) |
| 0.10 | A plugin hides content in the VS Code panel and the desktop Code tab | Surfaces (4) |
| 0.11 | Claude Code accepts a local mock API through `ANTHROPIC_BASE_URL` (what env and auth it needs) | The leak test kit (20) |
| ~~0.12~~ | ~~Lowest working Claude Code version~~ | Settled: the stated minimum is the oldest tested version (D-086) |
| 0.13 | Node is available where the backup lock runs. If not, we ship it as a single program file. | Backup lock |
| 0.14 | Whether `disableAllHooks` (in project, local or user settings), `--bare` and `CLAUDE_CODE_SIMPLE` switch off the mod and the settings hooks (D-021) | Self-protection, known limits (3, 17, 22), `doctor` |

How the checks are run (D-020): headless checks run against a local mock of the model API (`experiments/step0-mock/`, `claude -p`, no API key); the interactive terminal, VS Code and the desktop app are run by hand.

### Simulating Managed mode on your own computer

You don't need an organization to test Managed mode:
1. With admin rights, create the managed settings file at the system location for your OS. Claude Code's docs list the paths (on Windows, under `C:\Program Files\ClaudeCode\`).
2. Put the plugin in it in the `prepend` tier, with locked settings and `allowManagedHooksOnly`.
3. Better still, do this in a throwaway VM (Windows Sandbox, UTM or VirtualBox), so your own setup stays clean. Windows Sandbox needs Windows Pro or Enterprise; on Windows Home, use a temporary managed settings file and delete it right after the run (D-020).

This tests checks 0.2, 0.7 and the Managed-mode rows of spec 5.3 the way an organization would see them.

**Delivers:** `docs/engineering/findings-step0.md` (each check: yes or no, Claude Code version, OS, how it was tested). Any "no" is applied to `spec.md` in the same step.

---

## Step 1: Test kit

### 1a. Leak test kit (the most important test)

1. **Make fake secrets.** Each fake is unique, easy to search for, and built from pieces at test time.
2. **Mock model server.** A small Node server (built-ins only) that pretends to be the model API:
   - plays a scripted conversation of tool calls
   - records every request Claude Code sends
   - Claude Code is pointed at it with `ANTHROPIC_BASE_URL`
   - no API key, no cost, no network, same result every run
3. **Plant the fakes everywhere:**
   - typed and pasted messages
   - files Claude reads, `@` files
   - command output and failed-command errors
   - connected tools (MCP)
   - subagents
   - long chats that get compacted
   - `/resume` of a session recorded without the tool
   - project `CLAUDE.md` and settings-hook context
4. **Search every request for any fake,** as it arrives, in every form (plain, escaped, base64, URL-encoded, hex). Any hit is a failure. Each door also plants a harmless witness: no witness means the door wasn't used, and the run is invalid, never clean. Bodies are never kept or written to disk.
5. **Search the disk too.** Search the run's own config folder and report what Claude Code keeps on disk. This is reported, not failed, since some of it is outside our control. Your real `~/.claude` is never touched.
6. **No other network traffic.** A recording proxy refuses and logs every outbound attempt; any attempt makes the run invalid. CI also runs the kit once on Linux with no network at all.

CI runs it with `claude -p` on the pinned Claude Code version on macOS, Windows and Linux. The interactive terminal (including a real paste), VS Code and the desktop app are checked by hand once before release.

The kit lives in `tools/leak-test/` and is part of the release, so adopters can run it (spec 20).

### 1b. Test sets for catching secrets

| Set | Purpose | Contents |
|---|---|---|
| **Catch set** | Measure how much we catch | Realistic fake secrets in many places: env files, JSON, YAML, logs, URLs, connection strings, stack traces, escaped JSON, base64. Cloud, CI, artifact-repository and data-platform key formats, connection strings, short human passwords. |
| **Code set** | Prove labels don't hide normal code | `password: string`, `token = getToken()`, Python `pass`, `os.environ[...]`, type hints, template variables. Must stay unhidden (spec 7.2, R-08). |
| **False-alarm set** | Measure how often harmless text gets hidden | The `.ts` / `.d.ts` files under `node_modules/typescript` (Apache-2.0) and `node_modules/@types/node` (MIT), already installed as pinned dev deps. No download. |

The hidden set and a large downloaded corpus are parked (spec §23, D-019).

### 1c. Speed set

- Short messages.
- 100 KB and 2 MB logs.
- One huge line of JSON.
- A large base64 block with a secret in the middle.
- 10,000 registered secrets.
- Inputs designed to slow patterns down.

---

## Step 2: Checker

Build in this order, testing each piece before moving on:

1. **Gitleaks rule converter** (runs at build time)
   - Turns Gitleaks patterns into JavaScript patterns. Most don't work as-is (v8.30.1: 135 of 221 with a pattern fail as written, 23 still fail after stripping a leading `(?i)`; the checker's own parser handles them all).
   - Works out from each pattern: its required keywords, its longest possible match, and whether it can span lines.
   - Checks that each pattern can't get stuck, and rewrites or rejects any that can.
   - Every rule gets its own test.
2. **Keyword finder.** Reads the text once and finds all keywords at the same time.
3. **Pattern runner.** Runs only the patterns whose keywords were found, only on the area around each hit.
4. **Password labels.** The exact grammar in spec 7.1, plus the harmless values in 7.2. Must pass the code set.
5. **Repeated-line skip.** Cleared when a new secret is registered.
6. **Custom rules and per-rule actions** from settings, with the "can't get stuck" check (R-15).

---

## Step 3: Core hiding

1. **Registered-secret store and matcher**
   - The list locked by the OS password store through `$.process` (spec 8.1, D-023; the plugin has no AES, check 0.4).
   - Aho-Corasick over the secrets and their encoded forms.
2. **Decoder.** Decodes only what looks encoded, in pieces, at most 3 layers.
3. **Plugin skeleton**, **settings** (three levels, "stricter only" rules, validation, admin locks; spec 14) and **log** (spec 16). Until step 5 built it, `personal_data: on` showed "not available yet", so nobody believed it was working (D-037). The checker in `src/checker/` is copied or bundled into `plugin/` (mods import only files inside the plugin folder).
4. **Hide secrets** at `session.append`, `prompt.submit`, `prompt.context` and `prompt.attachment` (spec 5.1, D-042).
5. **Check-failure behaviour** with `.catch` handlers (spec 12, R-03, R-12).
6. **"I'm running" marker** (R-04).
7. **Placeholders** with hints and tags, shared with subagents, plus the stable instructions note (spec 9).

Then **Audit 1**.

---

## Step 4: Rest of the main lock

1. **`@` files** through `prompt.mention` (spec 5.3).
2. **Outbound check** with `block`, `ask`, `warn`, `off` and `/redact allow` (spec 11).
3. **Placeholder-in-file notice and overwrite guard** (spec 10, R-11).
4. **Resume scan** and **mid-session registration warning** (spec 6.1, 6.2).
5. **Media** `pass` / `drop` (spec 6).
6. **Observe mode** with the banner (spec 13).
7. **Self-protection** (spec 17).
8. **Commands:** `/redact`, `add`, `learn`, `allow`, `self-check [--report]`, `doctor` (spec 15).
9. **Version check** on startup (R-01).

---

## Step 5: Backup lock and tuning

1. **Settings hooks:**
   - before each tool: outbound check
   - after each tool: clean the output (check 0.9: the tool's own result, with its shape kept). A failed command's error is outside the limits (D-072).
   - on each prompt: block prompts with secrets
2. **Same checker** as the main lock, run with Node.
3. **Only act when needed.** Each hook reads the main lock's marker first and does nothing when it says running with a fresh beat (not older than 5 minutes). A crash leaves "running" behind, so age decides (spec R-04, D-077).
4. **Block on failure** or not, following `on_check_failure`.
5. **Install snippets** for Personal mode (`~/.claude/settings.json`) and Managed mode.
6. **Managed-mode run** from a real managed settings file, in CI on all three systems (D-080). Step 0 had no VM; it used a temporary managed file on the maintainer's PC (D-020). The run is in safe mode; one that starts in `observe` mode has not been done.
7. **Personal data:** the `personal_data` setting, off by default, finds emails and phone numbers (D-037). False alarms are measured on log-like text as well, because the false-alarm set is TypeScript sources.
8. **Tune** the rules and harmless-value list on the catch, code and false-alarm sets.
9. **Set the targets** for speed, catch rate and false alarms from the measurements, write them into the repo, and meet them.

---

## Step 6: Release

1. **Repo files:**
   - `LICENSE` (Apache-2.0), `NOTICE`, `THIRD_PARTY_LICENSES` (Gitleaks, MIT)
   - `SECURITY.md`, `CONTRIBUTING.md` (DCO), `CODE_OF_CONDUCT.md`
   - issue templates (bug report asks for `doctor` output and the self-check report)
2. **Plugin marketplace:** `.claude-plugin/marketplace.json`, with install tested from a clean machine.
3. **Docs:**
   - `README` (what it does, 2-minute install, limits)
   - `docs/personal.md`, `docs/managed.md`, `docs/verify.md` (running the leak test kit), `docs/troubleshooting.md`
4. **Results:** tested-versions list and scores for this release.
5. **Optional real run.** The same doors against the real API, run by the maintainer before each release. Moved here from step 1: it needs a real key and network, and there is nothing to test until the tool exists. It stays out of the kit, which uses neither (spec 20).
6. **Release:** step 6 ships the release candidate `v0.1.0-rc.1` (tag, archive, SHA-256 checksums, changelog); `v0.1.0` follows the two weeks of daily use and the hand checks. The install line points at a `release` branch, set as the repo's default; step branches still go into `develop`, and each release merges `develop` into `release` (D-083).
7. **Final name** chosen and checked (spec header): AegisContext (D-081).
8. **Built-in guard and organization install** measured in CI: `npm run leak-test:guarded` and `npm run leak-test:org` (D-082).
9. **Signed tags** from `v0.1.0-rc.2` on (D-094). The maintainer signs; the tool never holds the key.

Before release, the maintainer uses it for their own daily work for at least two weeks.

Then **Audit 2**.

---

## Step 8: Put secrets back and the weekly run

The design is D-096, accepted on 2026-11-03 after item 1 passed on 3 systems (spike S7). It stays off by default.

1. **Test first.** Does a rewritten tool input stay out of the next request to the model? If it doesn't, the model would see the real value: stop and redesign before any feature code.
2. **Then the rules.** Only after item 1 passes: mark D-096 accepted, then change spec §1, §2, §5.1, §9, §10, §14, §15, §22, §23, R-09, R-11 and the new R-18, the "stricter only" lines in the README and `docs/personal.md`, and the disk rule in `CLAUDE.md`. Done 2026-11-03.
3. **Restore rule.** A value goes back only into a file that already holds it on disk. Otherwise the placeholder stays, the write succeeds, and a message says how many values could not be restored. Nothing breaks.
4. **Commands.** `/redact put-back on` and `off`, `/redact put-back` for the state and why, and `--here` for one folder. The choice is kept in the tool's own folder, never in the repo. Claude can't run them (R-16).
5. **Order, first match wins** (spec §10): observe mode off; managed off (it binds with no `locked`); repo off; an unreadable choice file off; `--here`; the developer's choice for all projects; repo on, with the notice, if a surface can show it; default off.
6. **The notice** always shows which repo turned it on, even with `notices: off`. Under `claude -p` nothing can be shown, so a repo's "on" is ignored.
7. **Main lock only.** The backup lock keeps refusing those writes.
8. **Docs.** State the risk and recommend keeping it off. Publish the table below, and say that "Developer says" covers the choice for all projects and `--here`.
9. **Weekly run.** A scheduled CI job against the newest Claude Code. It is an early warning and proves nothing for a release, so add that exception to the "never just latest" ground rule.
10. **Audit 3.** `/security-review` and `/code-review high` on everything since `2f00d31`, because step 7 and D-087 to D-089 were never audited (progress, Known issues).

| Managed says | Developer says | Repo says | Result |
|---|---|---|---|
| Nothing | Nothing | Nothing | Off (the default) |
| Nothing | Nothing | On | On, with the notice |
| Nothing | On | Nothing | On |
| Nothing | On | Off | Off |
| Nothing | Off | On | Off, because the developer's choice wins |
| Off | Anything | Anything | Off |

---

## Step 9: Version warning in doctor only

The design is D-107, accepted.

1. **The rules first.** Mark D-107 accepted and D-103 superseded by D-107. Change spec R-01 to the wording in D-107, and add a session-start warning to spec §23.
2. **Tests.** The R-01 tests in `tests/core-lock.test.ts` and `plugin/hooks/lock.test.ts` expect the warning at session start. Each change to them needs the maintainer's yes (`CLAUDE.md`). New tests: a session start with an untested version shows nothing; `/redact doctor` shows the version with a report link and no fix for it.
3. **Code.** Remove the session-start warning and its `versionWarned` count; `/redact doctor` shows an untested version with a report link instead of "not on the tested list" and a fix.
4. **Docs.** `docs/troubleshooting.md` and `docs/tested-versions.md` no longer mention a session-start warning.

---

## Step 10: Put-back anywhere and Audit 4

The design is D-106, proposed until item 1 passes. It stays off by default.

1. **Probe first.** Does auto mode's permission classifier see a restored value? A scratch mod in `experiments/` rewrites a harmless marker into a Bash command and a Write; the maintainer runs it by hand in auto mode against the leak kit's mock. Pass: no request holds the marker. The result goes in `findings-step0.md`. If it fails, put-back as it ships has the same problem: record it in progress, Known issues, and stop for a redesign before any feature code.
2. **Then the rules.** Only after item 1 passes: mark D-106 accepted, then change spec §2, §9, §10, §14, §15, §22, §23, R-09 and R-11, and the put-back exception in `CLAUDE.md`.
3. **Restore anywhere.** While put-back is on, a placeholder from this session is replaced by its value in any file through Write or Edit, and in a command's text through Bash. A placeholder from an earlier session stays as text.
4. **The repo notice.** New text: secrets can go anywhere, network included. Shown once per repo, even with `notices: off`; `/redact` and `/redact doctor` keep showing it.
5. **Unchanged.** The order in spec §10, observe mode, R-17 and R-18, and the backup lock refusing these writes.
6. **Docs and release notes.** State that `on` now restores anywhere, the risks listed in D-106, and that freshly made random values must be made and stored in one command that prints nothing.
7. **Leak kit.** Clean with put-back on and off.
8. **Audit 4.** `/security-review` and `/code-review high` on the step's diff.

---

## Release rules (every release)

| Rule | Type |
|---|---|
| Zero fake secrets leaked in the leak test, for everything v1 covers | **Hard rule, blocks release** |
| Speed within published targets | Blocks release |
| Catch rate on the catch set not lower than last release | Blocks release |
| False alarms not higher than the published limit; code set fully unhidden | Blocks release |
| All tests pass on the pinned Claude Code version and all three operating systems | Blocks release |
| Tested-versions list and scores published | Blocks release |
| The release tag is signed, and the public key is published (from `v0.1.0-rc.2` on) | Blocks release |

Targets for speed, catch rate and false alarms are set by the maintainer in Step 5 and published in the repo. Any change to a target is noted in the changelog.

---

## Risks and how we handle them

| Risk | How we handle it |
|---|---|
| A Claude Code update changes how plugins work | Test on a fixed version; publish a tested-versions list; `/redact doctor` shows an untested version with a report link (R-01, D-107) |
| A pattern gets stuck and the hook is skipped | Build-time checks, small search areas, speed tests, `.catch` handlers. The backup lock steps in if the plugin goes down. |
| Too many false alarms, people turn it off | Code set, false-alarm set, observe-mode trials, `/redact allow`, admin locks |
| A check fails and content passes (default setting) | Visible warning and log entry every time. Admins can switch to `hold`. |
| Gitleaks rule updates bring bad or slow patterns | Fixed version, review every update, full tests before accepting |
| Claude Code's own records keep raw values on disk | Documented in the spec. Reported to Anthropic. |
| Users think they're protected when hooks are disabled by policy | `doctor`, startup warning, README section (R-05) |
| An organization can't get support | Self-verification kit, clear docs, `doctor` output in issues; support is best effort and says so |
| Node missing on some machines | Checked in Step 0 (check 0.13). Node is required for the backup lock (D-069). The Managed snippet sets `onFailure: "block"`, so a hook that can't start stops the call; `/redact doctor` warns when Node is missing or `onFailure` is not set. A single-program build is parked (spec §23). |

---

## Later (not in v1)

Everything parked lives in spec section 23.
