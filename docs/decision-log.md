# Decision log

What we decided, and **why**. This log helps:
- future sessions not reopen settled questions
- contributors understand the design
- us notice when a decision should be revisited

**Rules**
- Entries are numbered `D-001`, `D-002`, … and never deleted or renumbered.
- A changed mind gets a **new** entry. The old one is marked `superseded by D-0xx`.
- The "Why" is the real reason given at the time. If it wasn't recorded, it says so.
- No secrets in here, not even fake ones.
- Status is one of `proposed` (waiting for the owner), `accepted` or `superseded by D-0xx`.

**What counts as a decision:**
- a spec ambiguity resolved
- a design or algorithm choice
- a library, tool or format choice
- a default value or target number
- a rejected review finding
- anything a contributor would ask "why is it like this?" about

Tiny clarifications go under **Minor** at the bottom.

## Index

| ID | Title | Status | Part | Spec § |
|---|---|---|---|---|
| D-001 | License: Apache-2.0 | accepted | setup | 21 |
| D-002 | Two audiences: Personal mode and Managed mode | accepted | setup | 5.3 |
| D-003 | Add observe mode | accepted | setup | 13 |
| D-004 | Store registered secrets encrypted, not as fingerprints | superseded by D-023 | setup | 8.1 |
| D-005 | Default `on_check_failure: allow` | accepted | setup | 12 |
| D-006 | No putting secrets back into files in v1 | accepted | setup | 10 |
| D-007 | Build workflow: slash commands, one part per session, commit at wrap-up, docs in `docs/` | superseded by D-018 | setup | — |
| D-008 | Credit only code actually copied | accepted | setup | 21 |
| D-009 | Every question comes with a researched, evidence-backed recommendation | accepted | setup | — |
| D-010 | Test runner: `node:test` with native type stripping; `tsc` only typechecks | accepted | 0.0 | 21 |
| D-011 | CI: 3-OS matrix, SHA-pinned actions, timeout + concurrency; tick 0.0 after a green push | accepted | 0.0 | 4 |
| D-012 | Node 24 LTS for development and CI | accepted | 0.0 | 4 |
| D-013 | LF line endings on every OS (`.gitattributes`) | accepted | 0.0 | 4, 7, 18 |
| D-014 | Rejected review finding: test that `.nvmrc` matches `engines` | accepted | 0.0 | — |
| D-015 | End-of-step PRs: Claude opens the PR, the owner merges | superseded by D-018 | 0.0 | — |
| D-016 | Step 0 probe lives in `experiments/step0-probe/`, loaded with `--plugin-dir` | accepted | 0.A | 5.1 |
| D-017 | Probe log: `<cwd>/.step0-probe/<session id>.jsonl`, metadata only | accepted | 0.A | 5.1 |
| D-018 | Slim workflow: 7 steps, 3 commands, 2 audits | accepted | step 0 | — |
| D-019 | Scope cuts: test sets and release extras parked | accepted; signed tags superseded by D-094, lowest-version hunt settled by D-086 | step 0 | 4, 7.3, 20, 23 |
| D-020 | Step 0 checks: local mock for headless runs, temporary managed settings file, macOS/Linux finished in step 1 | accepted | step 0 | 4, 5.3, 8.1, 20 |
| D-021 | Add check 0.14: hook kill switches (`disableAllHooks`, `--bare`, `CLAUDE_CODE_SIMPLE`) | accepted | step 0 | 3, 17, 22 |
| D-022 | Apply the step 0 findings to the spec | accepted | step 0 | 4, 5, 6.1, 12, 18, 20, 22 |
| D-023 | Registered secrets are locked by the OS password store, not by our own AES | accepted | step 0 | 8.1, R-10 |
| D-024 | Leak kit searches requests as they arrive and keeps labels only; each door has a witness | accepted | step 1 | 20 |
| D-025 | Claude Code for the kit is pinned in its own lockfile folder | accepted | step 1 | 4, 20 |
| D-026 | Network proof: proxy trap on every run, plus one Linux run with no network | accepted | step 1 | 17, 20 |
| D-027 | The optional real-API run moves from step 1 to step 6 | accepted | step 1 | 20 |
| D-028 | Gitleaks v8.30.1 is vendored; keywords come from the patterns; 4 rules are rejected | accepted (rejected count changed by D-032) | step 2 | 7, 18, 21 |
| D-029 | Gitleaks allowlists by path and the `gitleaks:allow` comment are not carried over | accepted | step 2 | 3, 7 |
| D-030 | Upstream's true/false/null allowlist is anchored; two curl rules are rewritten by hand | accepted (curl rewrite replaced by D-032) | step 2 | 7, R-15 |
| D-031 | Password labels, URL passwords and truncated private keys | accepted | step 2 | 7.1, 7.2 |
| D-032 | Total work limits: custom patterns, curl rules and a share of the budget per rule | accepted | step 2 | 18, R-15 |
| D-033 | Long labels match as the end of a name with no boundary | accepted | step 2 | 7.1 |
| D-034 | Authorization headers and command-line passwords are checked | accepted | step 2 | 7.1 |
| D-035 | Values only read as code when they can't be passwords | accepted | step 2 | 7.2, R-08 |
| D-036 | Registered secrets are split into several store items, one code path for everyone | accepted (spec edit in step 3) | step 2 | 8.1, R-10 |
| D-037 | `personal_data` is built in step 5 | accepted | step 2 | 2, 14 |
| D-038 | `kubernetes-secret-yaml` stays rejected | accepted | step 2 | 22 |
| D-039 | The `gcp-api-key` allowlist is removed from our Gitleaks copy | accepted | step 2 | 21 |
| D-040 | `block` withholds, `warn` shows | accepted | step 3 | 14 |
| D-041 | Settings live in Claude Code's settings files | accepted | step 3 | 14 |
| D-042 | `prompt.context` and `prompt.attachment` are added in step 3 | accepted | step 3 | 5.1 |
| D-043 | A compact matcher for registered and caught secrets | accepted | step 3 | 18 |
| D-044 | Session catches and tags are kept in `$.state` | accepted | step 3 | 7, 8.1, 9 |
| D-045 | Store piece sizes and list caps come from measurements | accepted | step 3 | 8.1, R-10 |
| D-046 | The catch target is 135 of 138 | accepted | step 3 | 22 |
| D-047 | The mod can't delete files: the marker says not running, old logs are emptied | accepted | step 3 | R-04, 16 |
| D-048 | R-12: the log records every failure, the screen thins out repeats | accepted | step 3 | 12 |
| D-049 | Managed settings are the base; `locked` is what fixes one | accepted | step 3 | 14 |
| D-050 | `on_check_failure: allow` stays the default, with its cost now measured | accepted | step 3 | 12 |
| D-051 | The decoder tries every alignment, and a broken project source stands alone | accepted | step 3 | 14, 18 |
| D-052 | What is remembered is capped, because a matcher build can't be interrupted | accepted | step 3 | 7, 8.1 |
| D-053 | What is kept for a restart is capped at one `$.state` write, catches first | accepted | step 3 | 8.1, 9, 12 |
| D-054 | Four `/code-review high` findings from step 3 are rejected | accepted | step 3 | 8.1 |
| D-055 | Self-protection covers the tool's files and the settings that switch it off | accepted | 4 | 17, 22 |
| D-056 | The resume block drops the next prompt | accepted | 4 | 6.1 |
| D-057 | `/redact add` takes the secret in a pane, never on the command line | accepted | 4 | 8, 15, 22 |
| D-058 | Self-protection stays on in observe mode | accepted | 4 | 13 |
| D-059 | The plain doctor command is `/secret-shield:doctor` | accepted | 4 | 5.3, 15 |
| D-060 | `/redact allow` with no tag, and `--always` in the OS store | accepted | 4 | 10, 11, 15 |
| D-061 | A small flag file says a list exists | accepted | 4 | 8.1 |
| D-062 | A registered door, and the matcher build measured in the real worker | accepted | 4 | 20 |
| D-063 | The catch cap is a known limit | accepted | 4 | 22 |
| D-064 | A secret inside a forged placeholder stays a known limit | accepted | 4 | 22 |
| D-065 | Spec §9 names the tag exceptions | accepted | 4 | 9 |
| D-066 | A guard that can't look has failed, and fails as §12 says | accepted | 4 | 10, 12, 13 |
| D-067 | Self-protection follows links for files not there yet, and in its own roots | accepted | 4 | 17 |
| D-068 | The backup lock runs from a stable copy that `/redact backup` makes | accepted | 5 | 5.2, 15 |
| D-069 | Node is required for the backup lock; only the Managed snippet sets `onFailure: "block"` | accepted | 5 | 5.2, 5.3, 22, 23 |
| D-070 | Strict: every check before a tool runs, plus self-protection and the overwrite guard | accepted | 5 | 5.2 |
| D-071 | A letters-only value found only by a password label is not remembered | accepted | 5 | 7, 9, 22 |
| D-072 | Failed commands are outside the backup lock's limits; no batch hook | accepted | 5 | 5.2, 22 |
| D-073 | The mod guards skip `plugin/backup`, which has guards of its own | accepted | 5 | 5.2 |
| D-074 | The repeated-line skip is removed | accepted | 5 | 18 |
| D-075 | A type alias is code, and prose after a colon is left alone | accepted | 5 | 7.1, 7.2 |
| D-076 | How the backup lock finds its settings | accepted | 5 | 5.2, 14, 22 |
| D-077 | The marker has a `beat`; the numbers are guesses | accepted | 5 | 5.2 |
| D-078 | The targets | accepted | 5 | 19 |
| D-079 | Doctor finds Node by looking in the PATH folders | accepted | 5 | 15 |
| D-080 | Plan step 5 item 6 is met by a managed-file run in CI, not a Step 0 VM | accepted | 5 | 19 |
| D-081 | The final name is AegisContext | accepted | 6 | header, 14, 19 |
| D-082 | Claude Code's built-in guard: warn once, doctor line, measured in CI; only the organization install fixes it | accepted | 6 | 5.3, 19, 22 |
| D-083 | Step 6 ships `v0.1.0-rc.1`; the install line points at a `release` branch | accepted | 6 | 19 |
| D-084 | The organization install is a folder marketplace plus `prependPlugins` that also lists `sec-default@builtin` | accepted | 6 | 5.3, 19 |
| D-085 | `stable` 2.1.309 joins the tested list from one full-kit run on Windows | accepted | 6 | 4, 20 |
| D-086 | The stated minimum Claude Code is the oldest tested version, 2.1.309 | accepted | 6 | none |
| D-087 | Under `on_check_failure: hold`, a guard pass-over refuses the request | accepted | 6 | 5.3, 12, 22 |
| D-088 | Any one sign seats the guard; the warning names hook context and is proven in CI; the org run uses a real archive | accepted | 6 | 5.3, 22 |
| D-089 | Skill text is a door, named in the warning and measured under the guard | accepted | 6 | 5.3, 22 |
| D-090 | Step 7: fixes before daily use, then `v0.1.0-rc.2` | accepted | 7 | 5.2, 22 |
| D-091 | `/redact remove`: a picker, with no value on the command line | accepted | 7 | 8, 15 |
| D-092 | The guard's login path is measured with a made-up login; one host is let off the network rule there | accepted | 7 | 20, 22 |
| D-093 | Observe from managed settings is measured on the organization install | accepted | 7 | 13, 20 |
| D-094 | Release tags are signed with the maintainer's GPG key from `v0.1.0-rc.2` on | accepted | 7 | 19, 23 |

## Entry template (short form, from D-018 on)

```
## D-0xx: <title>
- Date / Step: YYYY-MM-DD / <n>        Status: proposed | accepted | superseded by D-0xx
- Decision: what we chose
- Why: the deciding reason, in the owner's words where they gave them
- Rejected: the main alternative(s), and why not
- Evidence: what backed it (file:line, docs URL, test output, findings row, D-id)
```

---

## D-001: License: Apache-2.0
- Date / Part: 2026-10-31 / setup. Status: accepted
- Context: The tool is to be open source and usable by individual developers and by companies, whose legal teams review licenses before adoption.
- Options considered: MIT / Apache-2.0 / dual MIT and Apache-2.0.
- Decision: Apache-2.0, with a `NOTICE` file.
- Why: It's permissive like MIT, adds an explicit patent grant, and corporate legal teams usually approve it quickly. It is compatible with the MIT-licensed Gitleaks rules we copy, as long as they're credited.
- Trade-offs: A longer license text and a `NOTICE` file to maintain.
- Revisit when: Never expected. Changing a license after outside contributions is hard.
- Links: spec §21; `LICENSE` and `NOTICE` (part 0.0).

## D-002: Two audiences: Personal mode and Managed mode
- Date / Part: 2026-10-31 / setup. Status: accepted
- Context: The first draft was written for one company (an IT install, a "security contact"). The open-source version must work for a single developer and for any organization.
- Options considered: Both, with a guide for each / developers first, with managed install as an appendix.
- Decision: Both, as first-class modes.
- Why: The owner wants any developer to "just use it", and companies to be able to adopt and test it themselves.
- Trade-offs: Two install paths to document and test. Personal mode has weaker guarantees (tier bypass, `allowManagedHooksOnly`), which must be stated clearly.
- Revisit when: Step 0 shows a mode can't meet its stated guarantees.
- Links: spec §5.3, §19; R-05.

## D-003: Add observe mode
- Date / Part: 2026-10-31 / setup. Status: accepted
- Context: The owner can't test inside company environments. Companies need a safe way to trial the tool and measure false alarms before it blocks anything.
- Options considered: Add `mode: observe | enforce` / always enforce.
- Decision: Add it. Default `enforce`. Only Managed or User settings can enable observe, never Project. A permanent banner shows while it's on.
- Why: It lets organizations run their own trial (observe → review the log → tune → enforce) without help from the maintainer.
- Trade-offs: In observe mode nothing is protected. Mitigated by the banner and the project-level ban.
- Revisit when: Pilot users find the banner insufficient, or observe mode gets left on by accident.
- Links: spec §13, §20; R-13.

## D-004: Store registered secrets encrypted, not as fingerprints
- Date / Part: 2026-10-31 / setup. Status: superseded by D-023 (the plugin runtime has no AES, check 0.4)
- Context: The first draft stored only keyed fingerprints plus length, so a copied file couldn't reveal even short passwords. The same draft wanted (a) the same cost for 10 or 10,000 secrets and (b) finding secrets inside base64 without decoding.
- Options considered:
  - A) Keyed fingerprints at every position for every registered length. Too slow on large outputs.
  - B) A rolling-hash prefilter, then a keyed confirm. A non-keyed rolling hash on disk weakens the fingerprint idea for short secrets.
  - C) Values encrypted at rest (AES-256-GCM) with the key in the OS password store, decrypted into memory per session, matched with Aho-Corasick over the raw and encoded forms.
- Decision (proposed): C.
- Why: It's the only option found that meets the speed goal and the encoded-form matching at the same time.
- Trade-offs: Anyone running as the same user can decrypt the file, just as they can read `.env`. It protects against the file being copied elsewhere, not against malware running as the user.
- Revisit when: Step 0 check 0.4 shows the mod runtime can't do the crypto or reach the OS password store, or the owner prefers the fingerprint property over speed.
- Links: spec §8.1, §18; R-09, R-10; plan Step 0 check 0.4; part 2.5.

## D-005: Default `on_check_failure: allow`
- Date / Part: carried over from the first draft. Status: accepted
- Context: When a check fails or times out (Claude Code gives each hook 10 s), the content either goes through or is held back.
- Options considered: `allow` with a warning / `hold`.
- Decision: Default `allow`, with a visible warning and a log entry every time. `hold` is available and lockable; the Managed-mode docs recommend it.
- Why: A failed check should not stop someone's work. Under `hold`, a slow password store or a hook that times out stops the request, and a tool that gets in the way gets switched off (plan, Risks). Anyone who prefers safety to flow can set `hold` with one setting, and an administrator can lock it. Written down by the owner on 2026-11-02; there is no measurement behind it.
- Trade-offs: A crash or slowdown lets that piece of content reach the model unchecked. The warning makes sure the user knows.
- Revisit when: The pilot shows failures happen often enough to matter, or adopters ask for a safer default.
- Links: spec §12; R-03, R-12.

## D-006: No putting secrets back into files in v1
- Date / Part: carried over from the first draft. Status: accepted
- Context: Claude only sees placeholders. When it writes a file, the real values could in principle be put back automatically.
- Options considered: Put back automatically / never put back; the developer fills in values.
- Decision: Never put back in v1. Placeholders written by Claude stay as text, with a notice. An overwrite guard (added in the review) stops real secrets being lost.
- Why: The first draft's goal: "Simple: only features that clearly reduce risk." Writing real secrets to disk on the model's behalf adds risk and complexity.
- Trade-offs: The developer has to fill in values by hand.
- Revisit when: Pilot users find manual filling too painful (it's a v2 candidate).
- Links: spec §10, §23; R-11.

## D-007: Build workflow
- Date / Part: 2026-10-31 / setup. Status: superseded by D-018
- Context: The tool is built with Claude Code across many sessions, so progress and reasoning must survive between them.
- Options considered: Slash commands / a copy-paste prompt file / both. Claude commits at wrap-up / the owner commits. Docs in the root / in `docs/`.
- Decision:
  - Project slash commands (`/next-part`, `/review-part`, `/wrap-up`, `/step-retro`, `/step0-check`, `/spec-change`, `/progress`)
  - one part per session
  - Claude commits at `/wrap-up`
  - spec, plan and logs live in `docs/`
- Why: Short reusable commands keep every session consistent. Commits per part give clean checkpoints. `docs/` keeps the root clean for the README, LICENSE and code of an open-source repo. The owner also asked that progress, decisions and design choices be logged to build a better product, hence `decision-log.md`, `lessons.md` and `/step-retro`.
- Trade-offs: Some ceremony per part.
- Revisit when: A `/step-retro` shows the ceremony slows work more than it helps.
- Links: `CLAUDE.md`, `.claude/skills/`, `docs/progress.md`.

## D-008: Credit only code actually copied
- Date / Part: 2026-10-31 / setup. Status: accepted
- Context: The design took inspiration from ideas seen online, but no outside code apart from the Gitleaks rules is used.
- Options considered: Credit every inspiration / credit only copied code.
- Decision: Credit only code or data actually copied, in `THIRD_PARTY_LICENSES`. Today that's only the Gitleaks rules (MIT, pinned version).
- Why: The owner: the idea is their own and they write their own code. Ideas aren't covered by copyright; copied code is.
- Trade-offs: None significant. An optional "Acknowledgements" line in the README remains possible.
- Revisit when: Any outside code or data is copied, which must be credited before it's merged.
- Links: spec §21; `CLAUDE.md` rules.

## D-009: Every question comes with a researched, evidence-backed recommendation
- Date / Part: 2026-10-31 / setup. Status: accepted
- Context: Building with Claude means many questions to the owner: design choices, spec readings, review findings. A bare question, or a recommendation with nothing behind it, pushes the research onto the owner and risks decisions built on guesses.
- Options considered: Ask freely / always include a recommendation / always include a researched recommendation that cites evidence.
- Decision: The last one. Every question uses the format in `CLAUDE.md` "Questions and recommendations": Question, Options, Recommendation, Evidence, Confidence. Claude researches first, cites only sources actually read or run, labels anything from memory as unverified, and says plainly when evidence is weak.
- Why: The owner asked that every question during planning or implementation carry "a proper researched and valid suggestion … backed by something".
- Evidence: The owner's request in the setup session.
- Trade-offs: Questions take a little longer to prepare. Decisions are better founded, and the evidence lands in this log.
- Revisit when: A `/step-retro` shows the research overhead outweighs the benefit for small questions.
- Links: `CLAUDE.md` ("Questions and recommendations"); every command in `.claude/skills/`.

## D-010: Test runner: `node:test` with native type stripping; `tsc` only typechecks
- Date / Part: 2026-10-31 / 0.0. Status: accepted
- Context: Every later part needs a test runner and a typecheck. CLAUDE.md forbids runtime libraries and asks for few pinned dev deps.
- Options considered: A) `node:test` with Node running `.ts` directly, plus `tsc --noEmit` / B) Vitest / C) `tsc` builds to `dist/`, then `node:test` runs that.
- Decision: A. Dev deps are exactly `typescript@7.0.2` and `@types/node@24.19.2`, installed with npm. `erasableSyntaxOnly` and `allowImportingTsExtensions` are on.
- Why: It needs the fewest third-party packages of any option (4 installed), which suits a security tool. There's no build step, and it's proven on this machine. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: A scratch run on Node v24.22.1 (Windows), where `npm test` ran `node --test "tests/**/*.test.ts"` and passed. `tsc` 7.0.2 rejected an enum with TS1294 under `erasableSyntaxOnly`. npm registry: typescript 7.0.2 published 2026-07-08.
- Trade-offs: No enums, namespaces or parameter properties. No watch UI or snapshots. Relative imports carry `.ts` extensions.
- Revisit when: tests need features `node:test` lacks, or Node type stripping changes.
- Links: CLAUDE.md "Rules"; plan "Ground rules"; `package.json`, `tsconfig.json`.

## D-011: CI: 3-OS matrix, SHA-pinned actions, timeout + concurrency; tick 0.0 after a green push
- Date / Part: 2026-10-31 / 0.0. Status: accepted
- Context: 0.0's "done when" needs the test to pass in CI, but the repo has no remote and Claude never pushes. An independent review (finding 6) noted there was no job timeout and that PRs would run twice.
- Options considered: Three-OS now, ticked after the owner's push / three-OS now, ticked at wrap-up / Ubuntu only until 1.8. For finding 6: a timeout and concurrency group / also a push branch filter / defer to 1.8.
- Decision: Ubuntu, Windows and macOS on Node from `.nvmrc`, with `npm ci --ignore-scripts`. Actions pinned to commit SHAs: checkout v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`, setup-node v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`. `permissions: contents: read`; `persist-credentials: false`. The job times out after 15 minutes, and a concurrency group cancels older runs. Push still runs on all branches. 0.0 is ticked when the owner's push shows green.
- Why: It keeps "done when" honest. Windows is the maintainer's OS, so catching its path bugs early matters, and spec §4 asks for CI on all three. The timeout limits the cost of a hang (the mock server arrives in 1.2). A branch filter could stop `step-*` branches getting CI before a PR exists. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: `git ls-remote` on actions/checkout and actions/setup-node (lightweight tags, so commit SHAs). GitHub workflow syntax docs, `concurrency` and "Using multiple events" ("multiple workflow runs will be triggered"). The 360-minute default job timeout is from memory and unverified.
- Trade-offs: The tick waits on the owner. Runs on three OSes cost more CI time.
- Revisit when: part 1.8 extends the matrix, or CI minutes become a problem.
- Links: spec §4; plan "Ground rules"; `.github/workflows/ci.yml`; `tests/repo-setup.test.ts`.

## D-012: Node 24 LTS for development and CI
- Date / Part: 2026-10-31 / 0.0. Status: accepted
- Context: The test setup (D-010) relies on Node running `.ts` directly; dev and CI need one pinned Node.
- Options considered: Node 24 only / Node 22 and 24 in CI.
- Decision: `.nvmrc` is `24`, `engines.node` is `>=24`, and `engine-strict=true`. The minimum Node for *users* (the backup lock) is not decided here; that is check 0.13 / part 0.E.
- Why: It matches the maintainer's machine, and native `.ts` tests were verified on it. Node 22 support wasn't tested. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: `node -p process.release.lts` printed `Krypton`; the scratch run on v24.22.1.
- Trade-offs: Contributors on Node 22 have to upgrade.
- Revisit when: 0.E / 0.13 sets the user-side minimum, or Node 26 becomes LTS.
- Links: `.nvmrc`, `package.json`, `.npmrc`; findings-step0 row 0.13.

## D-013: LF line endings on every OS (`.gitattributes`)
- Date / Part: 2026-10-31 / 0.0. Status: accepted
- Context: Independent review finding 8.
- Options considered: Add `.gitattributes` now / wait until hashed or golden files exist.
- Decision: `* text=auto eol=lf`, binary types marked as binary, plus a guard test. CRLF input is tested on purpose with fixtures built in the test, never by accident of checkout.
- Why: The checker's regexes, anchors, offsets and test-set sizes must not depend on where the repo was cloned. Adding it before any fixtures exist costs nothing. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: Git for Windows system config sets `core.autocrlf=true` (`git config --system --show-origin`: `C:/Program Files/Git/etc/gitconfig`). `git check-attr` shows `eol: lf` applied to existing files.
- Trade-offs: None significant; Windows editors must handle LF, which all modern ones do.
- Revisit when: a file genuinely needs CRLF, which would get a per-file attribute.
- Links: spec §4, §7, §18; `.gitattributes`; `tests/repo-setup.test.ts`.

## D-014: Rejected review finding: test that `.nvmrc` matches `engines`
- Date / Part: 2026-10-31 / 0.0. Status: accepted
- Context: Independent review finding 4 proposed a drift-guard test between `.nvmrc` and `package.json` `engines`.
- Options considered: Add the test / reject.
- Decision: Rejected.
- Why: `engine-strict=true` already makes any harmful mismatch fail `npm ci` in CI, which installs Node from `.nvmrc`. The only drift that would pass silently is bumping `.nvmrc` to a higher version, which is harmless. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: `.npmrc` (`engine-strict=true`), `package.json` engines `>=24`, `.nvmrc` `24`, all checked this session.
- Trade-offs: None.
- Revisit when: CI stops installing Node from `.nvmrc`, or `engine-strict` is removed.
- Links: `.npmrc`, `.nvmrc`, `package.json`.

## D-015: End-of-step PRs: Claude opens the PR, the owner merges
- Date / Part: 2026-10-31 / 0.0. Status: superseded by D-018 (the PR now comes from `/ship` at the end of each step; the owner still merges)
- Context: No rule said who opens and who merges the end-of-step PR into `develop`.
- Options considered: Claude opens the PR at the end of `/step-retro` and the owner merges / the owner does both / Claude merges / a draft PR from the start of the step.
- Decision: At the end of `/step-retro`, Claude pushes the step branch (no force), runs `gh pr create` into `develop`, and waits for CI. The owner reviews and merges; Claude never merges.
- Why: It keeps the owner as the only gate into `develop` while saving them the routine push and PR steps. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: A grep of CLAUDE.md, the skills and docs found no rule on PRs or merges; `gh` is logged in as Mrinanka (0.0 session notes).
- Trade-offs: An exception to "never push", for the step branch only.
- Revisit when: A step-retro shows PRs going stale, or the owner wants to push themselves.
- Links: CLAUDE.md "Git"; `.claude/skills/step-retro/SKILL.md`.

## D-016: Step 0 probe lives in `experiments/step0-probe/`, loaded with `--plugin-dir`
- Date / Part: 2026-10-31 / 0.A. Status: accepted
- Context: Parts 0.B, 0.C and 0.E extend the probe, and findings must be re-checked when the Claude Code version changes.
- Options considered: In the repo under `experiments/` / in the session's dev-mods folder (the plugin-authoring skill's default, hot-reloaded, tied to one session id).
- Decision: In the repo, `experiments/step0-probe/`, started with `claude --plugin-dir`.
- Why: It's versioned, so a re-check reproduces the same evidence, and later parts can build on it. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: `docs/findings-step0.md:9` (the re-check rule); `tsconfig.json` already excludes `experiments/`; the plugin-authoring skill (2.1.316) writes mods under `~/.claude/dev-mods/<session>/`.
- Trade-offs: Sessions have to be started with `--plugin-dir`.
- Revisit when: Step 0 ends (part 0.H): delete the probe or keep it for re-checks.
- Links: spec §5.1; plan Step 0; findings "The probe"; `experiments/step0-probe/`.

## D-017: Probe log: `<cwd>/.step0-probe/<session id>.jsonl`, metadata only
- Date / Part: 2026-10-31 / 0.A. Status: accepted
- Context: The probe needs somewhere to write one line per `session.append` row that is easy to read back and never holds content.
- Options considered: The session's working folder / the probe's own folder / the debug log via `$.ui.log` / the plugin's `$.store`.
- Decision: The session's working folder, gitignored, one JSONL file per session. The file is rewritten on each row, because `$.fs.write` replaces the whole file. Only fields on an allow-list are recorded, as types, ids and sizes.
- Why: It's easy to find and stays outside the watched plugin folder, so writing it shouldn't reload the mod. (Drafted from the session's evidence; the owner confirmed it.)
- Evidence: `claude-code.d.ts:3365` (`fs.write` replaces the whole file); plugin-authoring `reference.md:72` ("saving a file reloads the hooks module", read as applying to any file; untested); `claude-code.d.ts:3467` (`$.store` is a JSON file with a 4 MiB cap and no documented path). First real run: 17 rows logged, and a grep for the content found nothing.
- Trade-offs: The log lands in whatever folder you test in, so use a scratch folder. Rewriting the whole file on every row costs O(n²), which is fine for a probe.
- Revisit when: A log grows past 4 MiB (it then can't be read back, so the probe starts a new file), or the engine adds an append call.
- Links: spec §5.1, §16; `experiments/step0-probe/hooks/register.ts`, `summarize.ts`; `.gitignore`.

## D-018: Slim workflow: 7 steps, 3 commands, 2 audits
- Date / Step: 2026-10-31 / 0. Status: accepted. Supersedes D-007 and D-015.
- Decision:
  - The 44 parts are merged into 7 steps, one session each.
  - The 7 project commands are replaced by `/plan-step`, `/verify` and `/ship` (based on the owner's prompts from another project).
  - `/ship` commits, pushes the step branch and opens a PR into `develop`; the owner merges.
  - Per-part reviews, retros and `lessons.md` are dropped. Instead there are two audits (`/security-review` + `/code-review high`), after step 3 and before release.
  - Decision entries use a short form.
  - The question rule (D-009) stays, in compact form.
- Why: The owner: "we just made your software building impossible". The ceremony costs tokens and time without adding quality. Tests-first, the leak test and a few real audits are what protect quality.
- Rejected:
  - Keeping 44 parts with lighter ceremony (still 44 sessions).
  - 18 merged sessions (the owner judged it still too many).
- Evidence: the old `docs/progress.md` had 44 parts × 4 commands each (~175 runs). Part 0.0 alone produced D-010 to D-015 before any product code.

## D-019: Scope cuts: test sets and release extras parked
- Date / Step: 2026-10-31 / 0. Status: accepted
- Decision: Park the following in spec §23:
  - the hidden test set
  - the downloaded false-alarm corpus (replaced by the `.ts` files in `node_modules/typescript` and `node_modules/@types/node`)
  - the full compatibility matrix and the lowest-version hunt (check 0.12); v1 tests one pinned version on 3 OSes
  - signed tags (checksums only)
  - the "looks random" check (old §7.3)
- Why: The owner chose these cuts to save work without touching protection.
- Rejected: Also parking the backup lock, and Managed mode with observe mode. The owner kept both, so D-002 and D-003 stand.
- Evidence: Spec §5.2 and §13 (what the kept features cover); plan Step 1b and the release rules (where the cut items were required).

## D-020: Step 0 checks: local mock for headless runs, temporary managed settings file, macOS/Linux finished in step 1
- Date / Step: 2026-10-31 / 0        Status: accepted
- Decision:
  - Headless checks (0.1, 0.3, 0.5, 0.6, 0.9, 0.11, 0.14) run against a local mock of the model API in `experiments/step0-mock/`, with `claude -p`, a dummy `ANTHROPIC_API_KEY` and no network. Claude runs them; the owner runs the interactive terminal, VS Code and desktop checks by hand.
  - Managed mode (0.7, 0.8) is simulated with a temporary `C:\Program Files\ClaudeCode\managed-settings.json` on the owner's PC, deleted right after the run.
  - 0.4 (macOS `security`, Linux `secret-tool`) and 0.13 close as "partly (Windows)" and are finished in step 1's 3-OS CI, where `claude` gets installed for the leak test kit.
- Why: The mock is free, repeatable on a new Claude Code version, and seeds step 1. The owner's machine runs Windows 11 Home, which has no Windows Sandbox or Hyper-V. There's no Mac or Linux machine available now.
- Rejected: Real API runs by the owner (cost, not repeatable). A Docker container or VirtualBox VM for Managed mode (more setup, and Docker doesn't test Windows). Blocking step 0 on macOS and Linux.
- Evidence: Scratch run this session: `claude -p` (2.1.316, Windows) against a local Node mock, with `ANTHROPIC_BASE_URL`, a dummy key and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, made 2 × `POST /v1/messages?beta=true` with `x-api-key` and no `authorization` header, and the probe logged 14 rows. Managed settings paths: code.claude.com/docs/en/managed-settings. `wsl -l` lists only `docker-desktop`.

## D-021: Add check 0.14: hook kill switches (`disableAllHooks`, `--bare`, `CLAUDE_CODE_SIMPLE`)
- Date / Step: 2026-10-31 / 0        Status: accepted
- Decision: New Step 0 check 0.14. It tests whether `disableAllHooks` (in a repo's `.claude/settings.json`, local or user settings), `--bare` and `CLAUDE_CODE_SIMPLE` switch off the mod and the settings hooks.
- Why: Spec §3 counts "a file tells the tool to turn itself off" as in scope, and a cloned repo can carry this setting.
- Rejected: Parking it in §23, which would leave a known kill switch undocumented through steps 3–5.
- Evidence: code.claude.com/docs/en/hooks ("set `disableAllHooks: true` in your settings file"; it can't disable managed hooks unless set in managed settings). Scratch run this session: `claude --bare -p --plugin-dir <probe>` printed "hooks module not loaded: installed plugins that are not managed load no hooks module in this mode (--bare)".

## D-022: Apply the step 0 findings to the spec
- Date / Step: 2026-10-31 / 0        Status: accepted
- Decision: Every [Step 0] item in the spec is replaced by what was found (findings-step0.md, checks 0.1–0.14). Main changes:
  - §5.2: in Personal mode, safe mode turns off the backup lock too; only managed backup-lock hooks run in safe mode.
  - §5.2: the backup lock can clean a built-in tool's output (`updatedToolOutput` in the tool's own shape).
  - §5.3, §22, R-05: `disableAllHooks` in a project, `--bare` and `CLAUDE_CODE_SIMPLE` turn the tool off silently in Personal mode; `/redact doctor` must also work as a plain command with no hooks.
  - R-06: read resumed history at the first `turn.start`, block by not sending the first request, and show our own message.
  - §12, §18: the 10 s is the hook's own time; CPU-bound work is cut off at about 6 s.
  - §4, §20: the VS Code extension has its own Claude Code version.
  - §22: auto-memory and blocked prompts also land on disk.
- Why: Step 0's purpose; the owner approved the list ("Yes, make them").
- Rejected: Showing the exact wording first (the owner chose to apply directly).
- Evidence: findings-step0.md rows 0.1–0.14; mock scenario summaries and the owner's interactive runs (2.1.316, VS Code 2.1.314, Windows 11 Home).

## D-023: Registered secrets are locked by the OS password store, not by our own AES
- Date / Step: 2026-10-31 / 0        Status: accepted. Supersedes D-004.
- Decision: The list of registered secrets is locked by the OS password store itself (Windows DPAPI through PowerShell, macOS Keychain, Linux Secret Service), reached through `$.process`. No AES code of our own.
- Why: The plugin runtime has no AES (`crypto.subtle` has `digest` only). The owner chose this option.
- Rejected: Our own AES in TypeScript (hand-written crypto in a security tool is risky). Node does the AES (Node isn't on every machine, check 0.13).
- Evidence: findings 0.4 (`claude-code.d.ts:16030`; test kit own keys `["digest"]`; live `subtle:false`; DPAPI round trip `roundtrip-ok`, ~0.8 s); 0.6 (waiting on `$.process` doesn't count toward the hook's time). Unverified: size limits of Keychain and Secret Service items, and the macOS/Linux commands (step 1).
- With no password store, the tool runs without saved secrets instead of using a key file. The owner confirmed: "no one is running claude in a server or something with no password store".

## D-024: Leak kit searches requests as they arrive and keeps labels only; each door has a witness
- Date / Step: 2026-10-31 / 1        Status: accepted
- Decision: The mock searches each request on arrival, in every form (plain, escaped, base64 at 3 alignments, base64url, URL-encoded, hex), then drops the body. Only labels reach the records and the report, which is checked for fakes before it leaves the kit. Each door plants a harmless witness: no witness, a failed run, an unreadable body or a network attempt makes the run invalid, never clean. `--expect leaks` is the baseline and fails if any fake goes unseen.
- Why: A recording would be a file full of secrets, which the tool exists to prevent, and a leak test must not pass because nothing ran. The owner approved this in the step 1 plan. (Drafted from the session's evidence.)
- Rejected: Keeping the raw recording, as spec §20's wording suggests (it writes fakes to disk). Reusing the Step 0 mock as it was (`server.ts:200-220` returns before recording unknown paths, `count_tokens` and oversized bodies, and it can't read compressed bodies).
- Evidence: `tools/leak-test/`; 19 of 19 deliberate breaks of these safeguards caught by `tests/leak-*.test.ts`, with a passing control; docs: env-vars (large bodies are gzipped on direct connections). Trade-off: an old run can't be searched again.

## D-025: Claude Code for the kit is pinned in its own lockfile folder
- Date / Step: 2026-10-31 / 1        Status: accepted
- Decision: `tools/leak-test/claude-pin/` holds `@anthropic-ai/claude-code@2.1.316` with its own lockfile, installed with `npm ci --ignore-scripts`. The kit runs the platform binary directly and looks for: an explicit path, then the pinned install, then PATH.
- Why: The version is hash-checked and a normal install stays small. The owner chose this option.
- Rejected: A root devDependency (every `npm ci` pulls about 320 MB, and it still needs the direct binary path). The native installer (runs a script fetched live, not pinned by our lockfile).
- Evidence: Scratch install: 14 s, 321 MB, `bin/claude` a 500-byte stub, the platform binary printed 2.1.316; the lockfile has sha512 hashes for all 8 platforms. Docs: setup. npm dist-tags: `latest` 2.1.316, `stable` 2.1.309; 2.1.316 is what the findings used.

## D-026: Network proof: proxy trap on every run, plus one Linux run with no network
- Date / Step: 2026-10-31 / 1        Status: accepted
- Decision: Every run goes through a recording proxy that refuses and logs outbound attempts; any attempt makes the run invalid. CI also runs the baseline on Linux in a loopback-only namespace, after proving an outside connection fails there.
- Why: The trap only sees traffic that honours proxy settings; on Linux the namespace covers the rest. The owner chose this option.
- Rejected: The trap alone (weaker: it can't see a client that ignores proxy settings).
- Evidence: The trap caught `CONNECT api.anthropic.com:443` without `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` and nothing with it; CI run 41217109599: 0 attempts on 3 OSes, 98 of 98 in the namespace. Windows and macOS have no equivalent run (progress, Known issues).

## D-027: The optional real-API run moves from step 1 to step 6
- Date / Step: 2026-10-31 / 1        Status: accepted
- Decision: Plan 1a item 6 moves to plan step 6, and stays out of the kit.
- Why: There's nothing to protect until the tool exists, and the kit promises no key and no network. The owner chose this option.
- Rejected: Building a `--real` mode in step 1 (work on a mode with no tool to test; needs a real key and costs money to prove).
- Evidence: Spec §20 ("none of it needs an API key or network access"); plan 1a; scripted replies don't apply to a real model.

## D-028: Gitleaks v8.30.1 is vendored; keywords come from the patterns; 4 rules are rejected
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: `third_party/gitleaks/` holds exact copies of the rule file and licence at commit 83d9cd68; `npm run rules:build` converts them into `src/checker/rules.generated.ts`. Each rule's keywords are the literals its own pattern requires (spec §18), not Gitleaks' list. 218 of 222 rules convert; 4 are rejected with a reason: `pkcs12-file` (a file name, not text), `facebook-access-token` and `sourcegraph-access-token` (no literal every match must contain), `kubernetes-secret-yaml` (adjacent whitespace repeats compound; worst case above the limit).
- Why: Spec §18 says the list is worked out from the patterns. 33 rules get a longer keyword and 11 have an upstream keyword their pattern does not need.
- Rejected: Trusting Gitleaks' keywords (a match could lack them, or they could miss one).
- Evidence: `npm run measure` section 1; `tests/checker-rules.test.ts`.

## D-029: Gitleaks allowlists by path and the `gitleaks:allow` comment are not carried over
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: Global and rule `paths` allowlists and the `gitleaks:allow` line comment are dropped. Regex and stopword allowlists are kept. A rule's own `path` condition applies only when the file is known; with no file the rule runs.
- Why: Claude reading `node_modules` or a lock file still sends it to the model. A comment that excuses a line would let a file switch the tool off for itself (spec §3).
- Rejected: Copying Gitleaks' allowlists whole.
- Evidence: Gitleaks `detect/detect.go` (comment check), `config/allowlist.go`. A side effect: with no file known, `hashicorp-tf-password` also hides quoted 8 to 20 character values after `password`.

## D-030: Upstream's true/false/null allowlist is anchored; two curl rules are rewritten by hand
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: The global allowlist pattern `^true|false|null$` (unanchored in the middle, so any value containing "false" was skipped) becomes `^(?:true|false|null)$`. `curl-auth-header` and `curl-auth-user` swap their nested `.*` prefix for `curl` plus up to 1000 characters. The REWRITES table in `src/checker/convert.ts` fails the build if an upstream pattern changes.
- Why: The upstream forms nest repeats (R-15) or are wrong.
- Rejected: Rejecting the curl rules (they find real tokens in commands).
- Evidence: `tests/checker-rules.test.ts`.

## D-031: Password labels, URL passwords and truncated private keys (spec §7)
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: §7.1 also covers quoted and escaped keys (`"password":`) and URL passwords (`scheme://user:password@host`, 6 characters or more). A private key with no end line is hidden from its header to the last base64 line. In §7.2, a value equal to its own label is harmless everywhere, and "source files" means a known source extension. Weak labels need a value of 12 or more characters with 3 character classes (or 20 or more with 2 and a digit).
- Why: The owner's answers in the step 2 plan; the thresholds are first guesses for step 5 to tune.
- Rejected: Leaving URL passwords to the generic rule.
- Evidence: `tests/checker-labels.test.ts`, the code set.

## D-032: Total work limits: custom patterns, curl rules and a share of the budget per rule
- Date / Step: 2026-10-31 / 2        Status: accepted. Replaces the curl rewrite in D-030 and the rejected count in D-028.
- Decision:
  - Custom patterns get their own limits: worst-case cost 3,000 per start and open repeats capped at 2048 characters. Built-in rules keep 5e7 and 16 KiB, with a timed worst-case test each.
  - `curl-auth-header` and `curl-auth-user` start matching at the `-H` or `-u` flag. A new `requiresBefore` field checks for the word `curl` in the 1000 characters before it.
  - `sourcegraph-access-token` is rewritten without its bare 40-hex alternative, so 219 rules convert and 3 are rejected.
  - One rule may use a quarter of the time budget, so a slow rule can't stop the ones after it.
- Why: `/verify` hung the scan with an accepted pattern: 58 KB ran past a 45 s limit against a 2 s budget. The old check limited work per start position, but a regex call can't be interrupted and one piece has 65,536 starts. A first limit of 20,000 still took 6.7 s against a 1 s budget in the tightened test. The owner: "do the reccomendation and fix whatever needs fixing".
- Rejected: Timing a regex from outside (the mod has no way to stop one). Shrinking the curl gap (misses long commands). Keeping the bare 40-hex alternative (every git hash, and it left no keyword, so all Sourcegraph tokens were lost).
- Evidence: `tests/checker-hardening.test.ts`; 2 MB curl floods went from 2,700 to 6,400 ms to about 60 ms. A custom pattern with an open repeat over 2048 characters stops early; that is the cost of the limit.

## D-033: Long labels match as the end of a name with no boundary
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: `password`, `passwd`, `secret`, `token` and `apikey` match at the end of any name. `pass`, `pw`, `pwd`, `key`, `auth` and `access` still need a boundary. A label after an escaped `\n`, `\r` or `\t` counts as having one.
- Why: `PGPASSWORD`, `dbpassword` and `authtoken` leaked in `/verify`, though §7.1 says "end part of a name". The owner approved the recommendation.
- Rejected: Requiring a separator or a capital (the leak). Matching every label as a suffix (`bypass`, `monkey`, `oauth`).
- Evidence: `tests/checker-hardening.test.ts`. Together with D-034 and D-035, false alarms rose from 3.81 to 4.16 per MB with file names and from 50.98 to 60.69 with none.

## D-034: Authorization headers and command-line passwords are checked
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: New scanners in `src/checker/credentials.ts` and `labels.ts` for the forms in spec §7.1. Findings use the `password-label` rule id, so `rules.off` and `rules.actions` already cover them.
- Why: `Authorization: Bearer <opaque token>`, `--password value` and `-pvalue` all leaked in `/verify`, and all three are common in logs and commands. The owner approved the recommendation.
- Rejected: A general `-p` rule (`mkdir -p`, `docker -p8080:80`). A separate rule id for each form (more settings for the same idea).
- Evidence: `tests/checker-hardening.test.ts`, including the prose and reference cases left alone. A plain lowercase password after a flag is not hidden, and neither is a space-separated `mysql -p value`, which mysql itself treats as a database name.

## D-035: Values only read as code when they can't be passwords
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: Outside a known source file, a call or lookup must close its bracket, and a dotted value must end in its own label. Generics count as code only in a source file. `process.env.X` and `import.meta.env.X` are named lookups. `your-` placeholders hold letters only.
- Why: `Harbor.Meadow`, `Summer(2026`, `Hunter<2026>` and `your_` values leaked from `.env` files, because §7.2 treated those shapes as code in any file. The owner approved the recommendation.
- Rejected: Leaving this to step 5 (it is a leak, not tuning).
- Evidence: the code set stays at 41 of 41 left alone, 81 of 81 twins hidden. `token = res.data.jwt` shown through Bash is now hidden, a false alarm we accept.

## D-036: Registered secrets are split into several store items, one code path for everyone
- Date / Step: 2026-10-31 / 2        Status: accepted. Changes D-023's "one list" assumption; spec §8.1 is edited in step 3, once the numbers below exist.
- Decision:
  - Every list is split into pieces. A small list is simply one piece; there is no separate path for big `/redact learn` runs.
  - Piece size is set per OS, so Windows can usually use one piece and macOS and Linux use many small ones.
  - Step 3 first measures the exact size limit and the read time per piece on macOS and Linux. It then sets the piece size well under the limit, and a cap on the list size.
  - `/redact learn` says so when it reaches the cap, rather than slowing down without explanation.
  - Values go through stdin only, never on a command line. `add-generic-password -w <value>` is banned, even though it held more.
  - Saving is all or nothing: pieces first, a small index last, so a failed save leaves the old list working.
  - Reading proves the list is whole (piece count and checksum). A missing or bad piece gives a visible warning, never a silent partial list.
  - Removing or shrinking the list also clears pieces no longer used.
  - Step 3 verifies that `security -i` doesn't record the value anywhere.
- Why: Two code paths would leave the rarely used one the least tested, where a bug can lose saved secrets. The owner first raised blocks for big `learn` runs, then chose this recommendation: "i like your suggestion".
- Rejected: Blocks only for big `learn` runs (see Why). One item holding the whole list (check 0.4). The 10,000 figure as a store target: it is a speed goal for matching, and the store doesn't need to reach it unless the measurements allow it.
- Evidence: findings 0.4: DPAPI round trip ok at 1 MB; `security -i` and `secret-tool` ok at 1 KB, failing at 64 KB. Weak spot: no timing yet for reading many pieces on macOS or Linux, and a slow read would slow every session start.

## D-037: `personal_data` is built in step 5
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: Plan step 5 builds the setting for emails and phone numbers, off by default. Until then, step 3 shows "not available yet" when someone turns it on. Spec §2 no longer lists it as both a non-goal and an available setting.
- Why: The setting was in the spec but in no step, so step 3 would have accepted `personal_data: on` and done nothing, which is the false comfort R-05 exists to prevent. Step 5 is where false alarms get tuned, and that is the hard part. The owner chose this option.
- Rejected: Parking it in §23 (drops something organizations may ask for). Step 4 (ships before tuning, in the largest step).
- Evidence: spec §2, §14. Weak spot: false alarms are unmeasured, and the false-alarm set is TypeScript sources, so step 5 also measures log-like text.

## D-038: `kubernetes-secret-yaml` stays rejected
- Date / Step: 2026-10-31 / 2        Status: accepted
- Decision: The rule is not rewritten. The gap is listed in spec §22.
- Why: The owner chose this option. It avoids hand-written risk to speed, and hiding every value in a Secret would also hide harmless ones.
- Rejected: Rewriting it by hand in step 5.
- Evidence: A test Secret file through the checker: values under `password`, `db-password`, `api_key` and `tls.key` hidden; `dbconn`, `config` and `.dockerconfigjson` missed; `ca.crt` and `username` missed too, which are usually not secret. The rule's worst-case cost is over 1e12 per start.

## D-039: The `gcp-api-key` allowlist is removed from our Gitleaks copy
- Date / Step: 2026-10-31 / 2        Status: accepted. Changes "exact copies" in D-028 for `gitleaks.toml`.
- Decision: Our copy of `gitleaks.toml` lacks that one allowlist. Its 16 entries are whole Google-API-key-shaped strings; 1 is an obvious placeholder, and whether the others are real keys is unknown. `THIRD_PARTY_LICENSES` records the change and the upstream hash. Each Gitleaks update repeats this; the guard test fails if it is forgotten.
- Why: `CLAUDE.md` forbids committing them, and the guard test flagged both the copy and the generated rules. The owner chose this option. Dropping an excuse can only hide more: those strings are hidden if they ever appear.
- Rejected: Exempting the two files from the guard test (weakens a security test, and puts real-looking keys in the repo).
- Evidence: `/ship` step 3, once the new files were staged; `tests/no-whole-fakes.test.ts`. `/verify` had reported the guard as passing, but it only searches tracked files and these were untracked.

## D-040: `block` withholds, `warn` shows
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: `hide` is a placeholder. `warn` leaves the value visible, with a warning and a log entry. `block` drops a prompt with the reason; any other row keeps its place, with its text replaced by a short note. A blocked value stays blocked when it is seen again, bare or encoded.
- Why: Spec §14 listed the three words and never said what they do. The owner chose this option. A row can't be refused, so "withhold" is the nearest thing to blocking.
- Rejected: `block` as `hide` on rows (the name would promise more than it does, the false comfort R-05 warns about).
- Evidence: reference.md "a row the engine appends is never refused"; `PromptSubmitResult` `{ drop }`; `/verify` hook test, which showed a caught value losing its `block`, fixed in `src/core/session.ts`. Cost: one blocked value withholds a whole tool output.

## D-041: Settings live in Claude Code's settings files
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: One `secretShield` key, read with `$.settings.read({ source })`: `policy` is Managed, `user` is User, and `project`, `local` and `flag` are all treated as Project.
- Why: No paths of our own, and it follows the managed file's OS location and `CLAUDE_CONFIG_DIR`. The owner chose this option.
- Rejected: Our own three files (three paths per OS, and a second managed file for admins to deploy).
- Evidence: Prove-first run: the key reads back from `user`, `project` and `local`. `policy` is not proven on a real managed file; step 5's managed run must check it. Types: "Every key crosses as the source holds it".

## D-042: `prompt.context` and `prompt.attachment` are added in step 3
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: Both run the same hiding code as `session.append`. Spec §5.1 lists them.
- Why: `CLAUDE.md` text never passes `session.append`, and a rewrite there can be ignored for an attachment rendered per request. The owner chose this option.
- Rejected: Leaving them to step 4 (a door left open that step 4 would need anyway).
- Evidence: `claude-code.d.ts:4329`, `:4349`; reference.md; the `claude-md` and `hook-context` doors pass. A scratch door with fakes in a commit message passed too, so `gitStatus` is covered in `-p`.

## D-043: A compact matcher for registered and caught secrets
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: `src/core/matcher.ts` keeps Aho-Corasick in flat arrays. The checker's dense `Aho` stays for its keywords. Hex matches in either case; everything else is exact.
- Why: The dense table is states times distinct characters. By calculation that is about 780 MB for 10,000 secrets.
- Rejected: Reusing `Aho`, as its comment planned. A rolling hash (a shared prefix makes many candidates, so it has no linear guarantee).
- Evidence: Build for 10,000 secrets: 1.9 s under Node, 2.6M nodes, 93 MB; the search itself is about 2 ms. The store's list cap keeps a real list far smaller (D-045).

## D-044: Session catches and tags are kept in `$.state`
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: Catches and tags stay in host memory for the session, so a worker killed at the 6 s mark keeps them. Registered secrets are read again from the OS store.
- Why: A module variable dies with the worker, which would lose "once caught, always caught" and change tags mid-session. Accepted in the step 3 plan.
- Rejected: Module variables only.
- Evidence: Hook test "catches kept in $.state come back"; the kit's disk report shows no fake in any file of ours. Trade-off: the values sit in the clear in host memory, where another plugin can read them, which the threat model already leaves out.

## D-045: Store piece sizes and list caps come from measurements
- Date / Step: 2026-11-01 / 3        Status: accepted. Fills in D-036.
- Decision: macOS 2,048 bytes per item, up to 50 items. Linux 4,096 bytes, up to 64. Windows one item of 256 KiB. That holds roughly 750 secrets on macOS and 1,900 on Linux and Windows, at about 100 bytes each. A longer list is refused with `StoreFull`, and the old list stays.
- Why: About half the measured item limit on macOS and Linux. Items are capped so reading stays near 1 s at session start, and the list is capped so the matcher build stays short (D-052). The owner approved the wip push that got the numbers.
- Rejected: The 1 MB Windows item first planned: about 7,800 secrets is a matcher build the mod might not survive. The 10,000 figure stays a speed goal for matching, as D-036 says.
- Evidence: CI run 41242945288, `npm run measure:store`. Largest item: Keychain through `security -i` 3,840 bytes, failing at 4,096; Secret Service 8,192, failing at 8,448; DPAPI 2 MiB, the top of the range tried. Read per item: 18 ms, 11 ms, 214 to 229 ms on CI, about 500 ms on the owner's PC. `security -i` left the value in no top-level home file. The 10,000-secret build is about 1.9 s under Node.

## D-046: The catch target is 135 of 138
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: `jfrog/base64`, `connection-string/base64` and `labelled-password/base64` stay misses, are named in the test, and are listed in spec §22.
- Why: Each holds only a bare value in base64: no shape, no label, nothing a decoder could recognise. The plan's "all 138" could not be met. The owner approved the recommendation.
- Rejected: Hiding every base64 value (it would hide harmless data and break the output).
- Evidence: `tests/core-redact.test.ts`, `npm run measure` section 6.

## D-047: The mod can't delete files: the marker says not running, old logs are emptied
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: At `session.end` the marker is rewritten as `running: false`, and step 5 treats that like a missing marker. Logs past `log.days` are emptied; their names stay. A removed Windows store item is an empty file. The marker is written again at the next prompt, because `/clear` starts a new session id with no `session.start`.
- Why: `$.fs` has no delete. The owner approved the recommendation.
- Rejected: Deleting through `$.process` (a different command on each OS for a housekeeping job).
- Evidence: `claude-code.d.ts` `fs` noun; the session id note at `SessionEndInput`; hook test for the marker. Still open: a crash leaves `running: true`, a job for step 5 (progress, Known issues).

## D-048: R-12: the log records every failure, the screen thins out repeats
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: Each failure gets a log entry. The screen shows the first 3 of a kind, then every 50th with a count. Spec R-12 is reworded.
- Why: The owner approved the recommendation. A warning on every row of a slow run would bury the screen.
- Rejected: A warning for every failure on screen, which is what R-12 said.
- Evidence: `plugin/hooks/warn.ts`; `/verify` found 3 `.catch` paths with no log entry, now tested in `shield.test.ts`.

## D-049: Managed settings are the base; `locked` is what fixes one
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: Defaults, then Managed, then User, then Project (stricter only). A setting Managed doesn't lock can be changed by the user.
- Why: Spec §14 says the user "can change anything not locked", and an admin who wants a value fixed has `locked`. The owner approved the recommendation.
- Rejected: Managed beating the user on every value (`locked` would then mean nothing).
- Evidence: `src/core/settings.ts`, `tests/core-settings.test.ts`.

## D-050: `on_check_failure: allow` stays the default, with its cost now measured
- Date / Step: 2026-11-01 / 3        Status: accepted. Adds to D-005, whose reason is still not recorded.
- Decision: The default stays `allow`. The owner approved keeping it after seeing what it costs.
- Why: The owner approved the recommendation; no further reason was given. It stays D-005's open question.
- Rejected: Changing the default now, with the only known trigger fixed.
- Evidence: `/verify`: with `allow`, a 2 MB paste of an unclosed placeholder start sent 7 of 7 fakes to the model, exit 0. Fixed, but any hook killed outright sends its whole row unhidden. The deadline only covers work that checks it, so an unbounded step stays a leak, not a slowdown. Managed-mode docs still recommend `hold`.

## D-051: The decoder tries every alignment, and a broken project source stands alone
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: A base64 run is tried at all 4 alignments and after its first separators (past 256 KB, from its start and after separators only); hex at both. Wrapped base64 may be indented, and its short last line is read. Any try but the first must pass the printable gate, where valid UTF-8 counts as printable. A broken project source is left out alone, and only a broken Managed or User source falls back to the last good settings.
- Why: All were leaks or weaknesses `/verify` reproduced: `id-<base64>`, indented YAML, an odd hex prefix, non-ASCII passwords. A repo could also freeze the settings by carrying a broken value. Part of the owner's approval to fix `/verify`'s findings.
- Rejected: Splitting runs at separators only (misses a prefix with no separator).
- Evidence: `tests/core-hardening.test.ts`. False alarms with a file name stay at 5.55 per MB.

## D-052: What is remembered is capped, because a matcher build can't be interrupted
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: A value over 8,192 characters is hidden where it was found, but not remembered, and it never reaches `$.state`. The catch list holds at most 5,000 values and 100,000 characters in all.
- Why: A real 2 MB base64 paste sent 7 of 7 fakes to the model. The truncated-key rule took the block as a key body, the catch list took the 1.9 MB value, and the matcher build for its forms took 5 s in one stretch, which ended the worker. A build has no deadline check, so its size must be bounded instead.
- Rejected: A deadline inside the build (a half-built matcher can't be used, so the row would have to wait or go without).
- Evidence: `tests/core-hardening.test.ts`, `shield.test.ts`; CPU profile: 2.65 s in `SecretMatcher`. Real pastes of 2 MB adversarial text through the pinned Claude Code: 0 of 7 seen each, the base64 one down from 15.5 s to 2.9 s.

## D-053: What is kept for a restart is capped at one `$.state` write, catches first
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: `exportCatches` puts every catch first, then adds tagged values, oldest first, until the list reaches 4,000,000 characters of JSON. A tagged value left out gets a new tag after a restart; nothing is unhidden. A refused save warns, logs a failure and tries again on the next row.
- Why: The host refuses a larger write, and the list only grows, so warning and retrying alone would fail for the rest of the session and lose any catch made after that. The owner approved this in the review of the step 3 findings.
- Rejected: Warning and retrying with no cap (see Why). Dropping tagged values from the export altogether (a value the catch list refused would change tag after every restart).
- Evidence: Real 2.1.316 session: `$.state.set` accepts 4,194,304 characters of JSON and refuses 4,194,305, and the old value stays. Before the fix, in a scratch run, 600 distinct private-key-shaped values of about 8 KB overflowed at row 511: all 12 earlier catches were saved, and a catch made after that was gone after a simulated restart. Caught values are capped at 100,000 characters and 5,000 entries, so they stay far under the limit. Tests in `tests/core-hardening.test.ts`, `shield.test.ts`.

## D-054: Four `/code-review high` findings from step 3 are rejected
- Date / Step: 2026-11-01 / 3        Status: accepted
- Decision: No code change for four findings: a registered value has no size bound of its own; a Windows list over the one 256 KiB item could be read but not saved again; `npm run measure` builds a checker per Redactor; and the new hardening tests assert wall-clock limits and repeat the literal 8192.
- Why: The owner said to ignore these after a check of each against the code. First: its premise was false, since no registered-value limit exists and 8,192 is above `MAX_VALUE_FOR_PATTERNS`, not below it. Second: no such list can exist, because nothing outside the tests calls `saveList`, and D-045 chose the cap. Third: rules compile lazily, so it doesn't recompile them all. Fourth: the literal pins D-052's number, and the tests stay far inside their limits.
- Rejected: Fixing them in step 3 (no real failure to fix).
- Evidence: Measured on Windows under Node in that check: a 190 KB registered value builds in 189 ms, against 763 ms for the 1,900-secret list D-045 accepted. A fresh checker takes about 2 ms; sharing one saves about 0.5 s of a 13.4 s measure run. The timing tests took at most 309 and 275 ms against limits of 2,000 and 3,000, and 652 and 556 ms with every core busy. Still open: the matcher build under the real worker (progress, Known issues).

## D-055: Self-protection covers the tool's files and the settings that switch it off
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: Deny any write to the data and plugin folders. In Claude Code settings files, deny only a change to `disableAllHooks`, `allowManagedHooksOnly`, `hooks`, `enabledPlugins`, `secretShield` or `env.CLAUDE_CODE_SIMPLE`. Bash and PowerShell get a best-effort text check.
- Why: Check 0.14: one setting silently turns both locks off, and spec §3 has injection in scope. The owner chose this option.
- Rejected: Own files only (leaves the hole). Denying all settings writes (blocks ordinary edits).
- Evidence: Findings 0.14; a real run stopped a Write of `disableAllHooks`; `tests/core-lock.test.ts`. Weak spot: a disguised shell command, in spec §22.

## D-056: The resume block drops the next prompt
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: Scan at `prompt.submit` and drop the prompt with R-06's message; skip `session.compact`; hold `turn.step` as a backstop.
- Why: The drop shows the reason, and `/compact` would send the history too. The owner chose this option after asking whether old chats stay usable.
- Rejected: `turn.step` hold alone: `-p` prints only "Execution error" and exits 1.
- Evidence: Scratch runs on 2.1.316: drop printed the reason with no request; skip made no request. Leak door `resume`: 0 of 7, no request. Not yet hand-checked in an interactive `/resume`.

## D-057: `/redact add` takes the secret in a pane, never on the command line
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: A pane with an `Input`; the value goes to the store on stdin. Anything but `--label name` after `add` is refused, taken off the command row, and the person is told to rotate.
- Why: A value in the args stayed in history and reached the model on the next run, and with hooks off it went straight to the model. The owner chose this option.
- Rejected: Accepting args and masking (relies on masking, and fails open with hooks off).
- Evidence: Scratch runs; real run: no value on disk or in a request after the refusal. Cost: `Input` has no masking (`claude-code.d.ts:5656`), so it shows while typed, and there is no `add` in `-p`.

## D-058: Self-protection stays on in observe mode
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: Detections go log-only; denials of writes to the tool's files and kill switches continue.
- Why: Spec §13 and §17 disagreed. An injection during a trial must not switch the tool off. The owner chose this option.
- Rejected: Everything log-only.
- Evidence: `plugin/hooks/lock.test.ts`.

## D-059: The plain doctor command is `/secret-shield:doctor`
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: `plugin/commands/doctor.md` says the hooks are off; while they run, a `command.run` hook answers it instead. Its name follows the final plugin name.
- Why: A plugin's markdown command always carries the plugin's name, so `/redact doctor` can't work with hooks off. Approved with the step 4 plan.
- Rejected: A bare `/redact` markdown command (does not resolve).
- Evidence: Scratch runs on 2.1.316; real run with `disableAllHooks`: the body reached the model. `disable-model-invocation` kept the model out, and the engine refuses a registered command through Skill.

## D-060: `/redact allow` with no tag, and `--always` in the OS store
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: With no tag it lifts a resume block, or gives the last guarded file one pass. `--always` saves the value as a `harmless` list entry.
- Why: R-06 and R-11 name a bare allow. A settings file is plain text, so `allow` there would break R-09 for a value marked from a tag. Approved with the step 4 plan.
- Rejected: Writing the value into settings.
- Evidence: `plugin/hooks/lock.test.ts`.

## D-061: A small flag file says a list exists
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: `saveList` writes a non-secret `has-list` file before the index and clears it when the list is emptied. `hasList()` answers from it first. A list that can't be read warns, reports `locked`, is retried after 1 minute, doubling to 15, and refuses saves.
- Why: A locked store could pass for "no list" with no warning (progress, Known issues).
- Rejected: Reading the store to find out (the gap itself).
- Evidence: `tests/core-store-locked.test.ts`; `tests/store-locked-real.test.ts` in CI run 41289370109: a really locked Keychain and keyring both gave 0 entries, `locked` and a warning. The macOS Keychain was also seen to load again once unlocked; the Linux keyring wasn't unlocked in the test.

## D-062: A registered door, and the matcher build measured in the real worker
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: `STORE_SCENARIOS` holds a `registered` door of bare values. It runs on Windows, or with `--allow-real-store`, because elsewhere the store is the machine's own. Closes D-054's open item.
- Why: Nothing had run a saved list through a real session. Doing so found a real bug: with `OS` unset, Windows read as Linux and the list was silently skipped; a drive letter in the working folder now counts too.
- Rejected: Hook tests alone (they missed that).
- Evidence: Windows, pinned 2.1.316: a list of 1,900 values, a 3.6 s session, the value hidden, 0 failure lines. The 1,900 figure is Windows only. `registered` door 0 of 7 on all 3 OSes, CI run 41289370109.

## D-063: The catch cap is a known limit
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: Spec §22 now says the catch list can be filled by content (5,000 values, 100,000 characters). No code change.
- Why: It is a real limit and the spec should say so. The owner chose this.
- Rejected: A bigger cap (a bigger matcher build can kill the worker, D-052).
- Evidence: `src/core/session.ts:143`, `:144`; Known issues had one 141,000-character file filling it.

## D-064: A secret inside a forged placeholder stays a known limit
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: The code stays as it is. Spec §22 records the limit.
- Why: It only happens on purpose, and a fix wouldn't stop `rev` or other ways of disguising a secret. The owner chose this.
- Rejected: Treating a shape with an unknown tag as ordinary text (it closes this one route and leaves the others).
- Evidence: A scratch run on the step 4 tree: an AWS key id and an upper-case registered value inside the shape stayed visible, a mixed-case token was hidden, and a known password inside the shape stayed visible. Correction to the earlier note that a later bare copy is still caught: true for a value with a shape, a registered value or an earlier catch. A shapeless value seen first inside the shape is never caught, so its bare copy stays visible too.

## D-065: Spec §9 names the tag exceptions
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: §9 now says a value that couldn't be saved for a restart gets a new tag: over 8,192 characters (D-052), or past the saved list's cap (D-053).
- Why: It's cosmetic, since nothing is revealed, but the spec wasn't true as written. The owner chose this.
- Rejected: Saving fingerprints so such a value keeps its tag (the only hash here is async).
- Evidence: `src/core/session.ts`, `exportCatches`.

## D-066: A guard that can't look has failed, and fails as §12 says
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: The overwrite guard no longer treats an unreadable or over-4-MiB file as empty: that is a failed check, which warns, logs, and is denied under `hold`. Every refusing hook warns and logs what really happened, `turn.step` has a `.catch`, and `session.compact` and `turn.step` leave their whole check to it. Observe mode holds nothing, even under `hold`.
- Why: The missing tests found all of it. The guard passed silently under both settings, because `$.fs.read` rejects over 4 MiB and the error was swallowed; `tool.check` and `session.compact` failed with no warning; `tool.call` logged `allowed` when it had denied. R-12 says every failure.
- Rejected: Reading a big file in parts (the API has no range read). Replaying a `turn.step` stream after a failure: a test showed it sends the request twice, so the failure is passed on.
- Evidence: `plugin/hooks/lock.test.ts`. Real run on 2.1.316 with an API that answers 400: the same 6 requests and the same error with and without the plugin, and no failure line.

## D-067: Self-protection follows links for files not there yet, and in its own roots
- Date / Step: 2026-11-01 / 4        Status: accepted
- Decision: A path lands where its nearest existing folder lands. The data, plugin and config folders are compared in both spellings.
- Why: A Write of a new file through a linked folder passed, because `realPath` is absent for a missing file, and so did a real path when the config folder is itself a link (a common dotfiles setup).
- Rejected: Refusing every path that can't be resolved (the API's own example for an allow-list; here it would refuse each new file).
- Evidence: `plugin/hooks/lock.test.ts`, with links simulated. A scratch run on 2.1.316 with a real Windows junction into the data folder: a Write of a new file was refused with this tool's message and nothing landed. The config-folder case is simulated only.

## D-068: The backup lock runs from a stable copy that `/redact backup` makes
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: `/redact backup` copies `plugin/backup/` to `<config>/secret-shield/backup/`, writes its manifest last and prints the snippet to paste. Later sessions refresh an existing copy when the manifest differs, and never create one unasked.
- Why: The settings hooks point at a fixed path, and an installed plugin's folder can move or be replaced by an update. The owner chose the stable copy.
- Rejected: Pointing the hooks at the plugin folder (breaks on an update, and the Managed install has no plugin path to point at); a copy made at every session start (writes files the person never asked for).
- Evidence: `plugin/hooks/lock.test.ts` ("/redact backup copies the build ...", "a session start never creates the stable copy unasked", "refreshes an existing stale copy").

## D-069: Node is required for the backup lock; only the Managed snippet sets `onFailure: "block"`
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: The backup lock needs Node. The Managed snippet sets `onFailure: "block"` on all three hooks; the Personal snippet does not, and `/redact doctor` warns about it. A single-program build (no Node) is parked in spec §23, and plan.md's "single-program fallback" lines change to say so.
- Why: Claude Code is a native binary, so Node is not guaranteed (check 0.13). Without `onFailure: "block"` a hook that cannot start is only a warning.
- Rejected: A single-program build in this step (a second build to test on three systems); `onFailure: "block"` in the Personal snippet (a missing Node would then stop every prompt and tool call).
- Evidence: `tests/backup-claude-real.test.ts` on 2.1.316, with a PATH that holds no program: with `onFailure: "block"` the prompt is stopped and no request is sent; without it the prompt goes through and the fake is seen by the model.

## D-070: Strict means every check before a tool runs, plus self-protection and the overwrite guard
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: When the main lock is not alive, the backup lock checks a tool call for saved values, shapes and labels (not only saved values, as the main lock's outbound check does), then applies self-protection and the overwrite guard. A prompt holding a secret is blocked whole, because a hook cannot hide part of one. Tool output is cleaned and keeps its shape.
- Why: The backup lock is the last thing standing; its false alarms cost a refused call, its misses cost a leak. The owner chose strict.
- Rejected: The main lock's outbound rule as it is (a secret that was never registered or caught passes).
- Evidence: `tests/backup-act.test.ts`; `npm run leak-test:backup`: 0 of 49 fakes seen over 7 doors on 2.1.316.

## D-071: A letters-only value found only by a password label is hidden where found, not remembered
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: A finding of rule `password-label` whose value is letters only is hidden where it is found, but not added to the session's catches. A value with a digit or a symbol, or one that a format rule or a custom rule found, is remembered as before.
- Why: A label cannot tell a password from a code word (`password: SecretString`). Remembering the word hid it through the rest of the text: with no file name, 953 of 1,010 hits were repeats of 57 values, 38 of them plain words.
- Rejected: Not remembering any label-found value (a real password with a digit would then be hidden once only); a list of code words (never finished).
- Cost, now in spec §22: a real letters-only password found only by its label is not hidden when it later appears without the label.
- Evidence: `tests/tuning.test.ts`. False alarms per MB with no file name, through the pipeline: 350.28 before, 76.30 after. Catch stays 135 of 138, code set 41 of 41, twins 81 of 81.

## D-072: Failed commands are outside the backup lock's limits; there is no batch hook
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: The backup lock cannot clean the error of a failed command. It has no `PostToolBatch` hook. `bash-failed` goes in spec §22 as not covered, and its kit scenario runs expecting every fake to be seen.
- Why: Spike S1 on 2.1.316. `PostToolBatch` does see a failed command's error as a string, and `decision: "block"` does stop the request. But the blocked result stays in the conversation: a follow-up prompt in the same session sent the raw error in full. `PostToolUseFailure` can only add context. So a block would delay the leak by one prompt and show a pass in a one-prompt kit run. The owner chose "outside the limits".
- Rejected: Block anyway and document the gap (a single-turn kit run passes while a real session leaks one prompt later); a second check on the next prompt (new design, beyond the plan).
- Evidence: the spike in `docs/findings-step0.md` Notes; `npm run leak-test:backup-limits`: `bash-failed` 7 of 7 fakes seen.

## D-073: The mod guards in `tests/plugin-build.test.ts` skip `plugin/backup`; the backup has guards of its own
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: `plugin/backup/` is compiled Node code, not a mod, so the guards that forbid Node, `process` and dynamic imports in the plugin skip it. `tests/backup-build.test.ts` adds stricter ones for that folder: only `node:fs`, `path`, `os`, `child_process` and `crypto`; no network module, `fetch`, `eval`, `WebAssembly` or `require`; imports stay inside the folder; the output equals what `tsc` makes from the sources.
- Why: The plan puts the build in `plugin/backup/`, where an install carries it. The owner approved the one-line change to the existing test.
- Rejected: Emitting the build outside `plugin/` (the install would no longer carry the backup lock).
- Evidence: `tests/backup-build.test.ts`, `tests/plugin-build.test.ts`.

## D-074: The repeated-line skip is removed
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: The memory of lines already found clean is removed from the checker (`src/checker/lines.ts` is deleted). `clearLines()` stays as a function that does nothing, so no caller or test changes. Spec §18 item 5 is edited.
- Why: The cause is confirmed: 160 of 219 rules can match across a newline (their separator classes hold `\x0A`), so only 59 rules were ever skipped. Measured warm on a 2 MB log, an empty memory took 38.2 ms and a full one 44.1 ms; on a 150 KB log, 11.9 and 12.0 ms. A safe key (the line plus the text after it) would almost never repeat. The plan said to remove it if it still gained nothing.
- Rejected: Fixing the skip (no gain to win); keeping it (code and a cached-clean-line risk for nothing).
- Evidence: `tests/checker-*.test.ts` (376) pass unchanged; scratch timings in `docs/progress.md` session notes.

## D-075: A type alias is code, and prose after a colon is left alone
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: (1) On a line that starts `type Name<...> =` (with `export` and `declare` allowed), an unquoted value is code, with no file name needed. (2) After `label:` and a space, an unquoted value of six or more lowercase letters that has a space and a letter right after it is prose (`token: signature mismatch`). Spec §7.1 and §7.2 are edited. Each has a harmless test and a twin showing a real-looking value in the same spot is hidden (R-08).
- Why: (1) The step 2 false alarms were nearly all label hits on type aliases. (2) It was the biggest class in the log-like set. The owner said yes to (2) at the targets step.
- Rejected: Treating a capitalised word after `label:` as a type name (a password such as `Harbor` looks the same); hiding generic hex values less (many real API keys are 32 hex characters).
- Cost of (2): `password: summerrain admin` no longer hides `summerrain`. An unquoted multi-word YAML passphrase already leaked every word after the first.
- Evidence: `tests/tuning.test.ts`. Log set (1.05 MB): 404.8 to 214.3 false alarms per MB; catch, code set and twins unchanged.

## D-076: How the backup lock finds its settings
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: It reads the user, project and local files and the managed file (`managed-settings.json`, then `managed-settings.d/*.json` in alphabetical order), plus `--policy <file>` for a managed setting delivered by MDM or from the server. The Managed snippet carries a `--policy` placeholder. A managed source it cannot read or understand makes `on_check_failure` `hold`. The levels and "stricter only" rules are the main lock's own. A `--settings` flag is not visible to a hook (spec §22).
- Why: A hook process has no `$.settings`. A broken file from an organization is not a reason to let things through.
- Evidence: `tests/backup-settings.test.ts`; the managed run in CI (`npm run leak-test:managed`) finds a logged notice for an unknown `secretShield` key of a real managed file.

## D-077: The marker has a `beat`; the numbers are guesses
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: The marker holds `{ running, started, beat, version }`. The main lock refreshes `beat` at most every 30 seconds while it is used, and writes the marker again after a worker restart. The backup lock counts a beat fresh for 5 minutes, and a beat more than 5 seconds in the future not at all. 30 seconds and 5 minutes are first guesses with no measurement behind them; if they are wrong the cost is a stricter backup lock for a while, or a few extra seconds before it acts after a crash.
- Why: A crash leaves `running: true` behind (Known issue), so age must decide.
- Evidence: `tests/backup-marker.test.ts`, `plugin/hooks/lock.test.ts`, `tests/backup-real.test.ts` (stand-down and the stale cases as a real program).

## D-078: The targets
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: Speed 1,500 ms per item through the pipeline and 500 ms median for a backup hook call; catch at least 135 of 138; code set 41 of 41, twins 81 of 81; false alarms per MB at most 6.5 (source files with a file name), 90 (no file name), 250 (log-like text). In `docs/targets.md` and `tools/measure/targets.ts`.
- Why: Set by the owner, with headroom, from the measurements in `docs/targets.md`. CI runners on macOS and Linux were not measured.
- Evidence: `docs/targets.md`; `tests/targets.test.ts`; `npm run measure`.

## D-079: Doctor finds Node by looking in the PATH folders
- Date / Step: 2026-11-01 / 5        Status: accepted
- Decision: `/redact doctor` looks for `node` in each PATH folder, then runs it by its full path for the version, instead of running `node`.
- Why: On 2.1.316, `$.process.run(["node", ...])` fails with "not found or is in an unsafe location (current directory)" when the PATH has an empty entry (the maintainer's has one, as many do), although a settings hook starts `node` from the same PATH. Doctor said "Node not found" on a machine where the backup lock ran.
- Evidence: a scratch run of `/redact doctor` under `claude -p`, before and after.

## D-080: Plan step 5 item 6 ("Managed-mode run in the Step 0 VM") is met by a managed-file run in CI
- Date / Step: 2026-11-01 / 5        Status: accepted (the owner said "use your judgement" and Claude chose yes; plan item 6 reworded to match)
- Decision: Step 0 never had a VM: D-020 simulated Managed mode with a temporary managed settings file, and the VirtualBox/Docker idea was rejected there. So step 5 runs the backup lock from a real managed file the same way, in CI (`npm run leak-test:managed`, `tests/doctor-managed-real.test.ts`), on all three systems. The plan item should read "managed-file run" instead of "Step 0 VM".
- Why: The words in the plan point at something that does not exist. The managed file run is what D-020 already chose, and it works on the other two systems, which the maintainer's PC cannot test.
- Cost: it has not run on this PC, and "starting in observe mode" is not part of that run (it runs in safe mode). Both stay open until the first CI run is read.
- Evidence: `docs/decision-log.md` D-020; `package.json` scripts; `.github/workflows/ci.yml`.

## D-081: The final name is AegisContext
- Date / Step: 2026-11-01 / 6        Status: accepted (replaces NoCreds, which the step 6 plan had chosen earlier the same day)
- Decision: Plugin `aegiscontext`, settings key `aegisContext`, environment prefix `AEGISCONTEXT_`, data folder and password-store service `aegiscontext`, repo `Mrinanka/aegiscontext`, doctor `/aegiscontext:doctor`. `/redact` stays. The old working name `secret-shield` is gone from the product; the history in this log and in progress stays as written. Nothing was published under an earlier name.
- Why: The owner proposed it ("AegisContext, lets check its eligibility") after reading the NoCreds plan, and chose it when shown the risk.
- Rejected: NoCreds (kept as the recommendation: no tool of that name found, but narrower than what the tool hides). Pausing the name until v0.1.0 (a later rename would touch the saved-values store name and the settings key again).
- Evidence: `npm view` for `aegiscontext`, `aegis-context` and `@aegiscontext/core`: 404 (free). GitHub search: no repo named `aegiscontext`; 39 for `aegis-context`, among them Aegis-Context-Broker (middleware for IDEs). Web search: "Aegis" is used for a Claude Code secret-detection MCP server (aegis-sec), an LLM secrets firewall (andreaskasper/aegis on Docker Hub) and a Kubernetes secrets store (shieldworks/aegis), so confusion is a risk; the README says in one line that this is a different project. No trademark register was searched; that is on the release checklist for v0.1.0. The name has no "Claude" or "Anthropic".

## D-082: Claude Code's built-in guard: warn once, doctor line, measured in CI; only the organization install fixes it
- Date / Step: 2026-11-01 / 6        Status: accepted (approved with the step 6 plan); "and with" below is corrected by D-088, and hold is added by D-087
- Decision: On a machine with managed settings, and with a Team or Enterprise login, Claude Code seats `sec-default@builtin` outermost and routes `prompt.context`, `prompt.attachment`, `prompt.compose`, `session.compact` and the `attachment`, `hook-context` and `compaction` rows of `session.append` past user-tier plugins. The plugin cannot close this (`turn.step` pins `messageCount`). It marks `prompt.compose` in `$.state`, and the first main `turn.step` without the mark warns once and sets a flag; `/redact doctor` shows the tier and the guard state (R-05a). The doors are measured in CI by `npm run leak-test:guarded` and listed in `GUARDED_OPEN`; `npm run leak-test:org` proves the organization install leaves none open.
- Why: Users must never believe they are protected when they are not (R-05). The leak could not be measured on this PC: the guard seats only when a real managed file exists, and the kit does not write the machine's managed file here (D-020). `CLAUDE_CODE_MANAGED_SETTINGS_PATH` did not redirect the policy folder in a scratch run (the debug log still read the Program Files file and said "not seated").
- Rejected: Staying silent. A hook that rewrites the messages itself (`turn.step` pins them).
- Evidence: the 2.1.316 binary strings ("seated by managed prependPlugins at position", "not seated: managed prependPlugins does not list it", the `prependPlugins` description); `tests/guard-check.test.ts`; `plugin/hooks/lock.test.ts` (guard tests; 151 pass under `claude plugin test`); `tests/leak-org.test.ts`. **Measured in CI (run 41329156820 and the next, all green, macOS/Windows/Linux, Claude Code 2.1.316):** `claude-md` and `hook-context` leak 7 of 7 under a user-tier plugin; `mention-file` stayed clean (the plan expected it to leak); the compaction summary is stored raw and the resume check then holds the next message, so the model is not sent it (kit scenario `compaction-held`, found when the first run reported no witness: run 2 made 0 requests). `leak-test:org`: 0 of 91 fakes seen, 13 doors, and the debug log showed the plugin in tier `prepend` and the guard seated by `prependPlugins`, on all three systems. Attachments and the instructions note have no door in the kit.

## D-083: Step 6 ships `v0.1.0-rc.1`; the install line points at a `release` branch
- Date / Step: 2026-11-01 / 6        Status: accepted (approved with the step 6 plan)
- Decision: The release candidate first; `v0.1.0` after two weeks of daily use and the hand checks. A new `release` branch is the repo's default, so a plain install gets released code. Step branches still go into `develop`; each release merges `develop` into `release`. The release workflow runs on a `v*` tag, calls CI, runs the README install on three systems and makes a draft release. The maintainer merges and tags; Claude never does.
- Why: `develop` is the default branch now, so a plain install would give users unreleased code.
- Rejected: Installing from a tag only (the README line would need a ref syntax that was not verified). Making `develop` stable.
- Evidence: `tools/release/pack.ts`, `tests/release-pack.test.ts`, `.github/workflows/release.yml`, `tests/docs.test.ts`.

## D-084: The organization install is a folder marketplace plus `prependPlugins` that also lists `sec-default@builtin`
- Date / Step: 2026-11-01 / 6        Status: accepted
- Decision: Managed settings carry `extraKnownMarketplaces` (a `directory` source), `enabledPlugins` and `prependPlugins: [aegiscontext@aegiscontext, sec-default@builtin]` (`docs/snippets/managed-plugin.json`). A plugin from GitHub or a git URL counts as a user's, so spec §19's "internal git mirror" no longer reaches `prepend`; it serves the Personal install only. A `directory` marketplace installed in a scratch run with a path holding a space (`tests/install-real.test.ts`); a `file://` git source was refused by `claude plugin marketplace add` and did not resolve from settings either, so the install from git is proven only by the release workflow's README job, from GitHub.
- Why: The binary's `prependPlugins` text says a list replaces the guard's default seat, so the guard must be listed or it is removed. Evidence of the tier is the debug log (`tier prepend`), which the kit requires.
- Rejected: Digest-pinned `pluginDigests` (a folder must prove a digest, and a checkout whose line endings changed proves nothing; the kit measures the plain folder first).
- Evidence: 2.1.316 binary strings; `tools/leak-test/org.ts`; `tests/leak-org.test.ts`. **Measured:** the first CI run of `leak-test:org` seated the plugin in `prepend` from a folder marketplace on macOS, Windows and Linux (the kit makes the run invalid otherwise).

## D-085: `stable` 2.1.309 joins the tested list from one full-kit run on Windows
- Date / Step: 2026-11-01 / 6        Status: accepted
- Decision: `TESTED_VERSIONS` gains 2.1.309. The full kit ran from a scratch install of `@anthropic-ai/claude-code@2.1.309` on Windows with `--claude`: the baseline saw 98 of 98 fakes, the plugin run saw 0 of 105 across 15 doors. Not run in CI, nor on macOS or Linux; `docs/tested-versions.md` says so.
- Why: `stable` is what many people run; a warning at every session start for them would be noise, and the kit says it holds.
- Rejected: Adding `stable` to the CI pin (a second 320 MB install per job for one older version).
- Evidence: the run's output (labels and counts only), this session.

## D-086: The stated minimum Claude Code is the oldest tested version, 2.1.309
- Date / Step: 2026-11-01 / 6        Status: accepted
- Decision: `README.md` and `docs/personal.md` say 2.1.309 or later, not 2.1.275.
- Why: 2.1.275 had no source anywhere in the repo, and nothing has been tested below 2.1.309. The owner approved the recommendation after the review check.
- Rejected: Testing 2.1.275 (a passing install line would still not show the hooks work there).
- Evidence: `git grep` found 2.1.275 only in those two files; `src/core/versions.ts`; the install line's text is in the 2.1.309 Windows binary, which was searched but not run.

## D-087: Under `on_check_failure: hold`, a guard pass-over refuses the request
- Date / Step: 2026-11-02 / 6        Status: accepted
- Decision: A main `turn.step` with no `prompt.compose` seen is refused when `on_check_failure` is `hold` (observe holds nothing), every time, with an answer that says why and how to fix it. The warning still shows once. A failed read of the flags is no sign of a pass-over, so it never stops a request. Spec §5.3, R-05a, §12 and §22 updated. This adds to D-082, which never considered it; it does not reopen it.
- Why: `hold` is a choice to fail closed, and managed docs recommend it, yet raw instruction text went out in the same request the warning fired for (`register.ts`). The owner approved the recommendation after the review check.
- Rejected: Documenting the gap only (`hold` would still not mean hold).
- Cost: A user-tier install under `hold` on a guarded machine sends nothing until it moves to the organization install or to `allow`. A Claude Code change that stopped `prompt.compose` coming first would stop those users too; `leak-test:org` forbids the warning, so CI would show it. Two tests in `plugin/hooks/lock.test.ts` gained `prompt.compose` setup (the owner approved; assertions unchanged), because a hold test with no compose now reads as a guarded machine.
- Found on the way: a `turn.step` hook that answers without `next` must stream its text and a stop chunk. The engine reads the stream, not the return, so the two older holds in `register.ts` (the resumed history, a failed check) stopped the request but showed "Execution error" with exit 1, and no test or kit run had reached them. All three now stream.
- Evidence: a real run of Claude Code 2.1.316 against the kit's mock, with a scratch copy that never marks `prompt.compose`: 0 requests, and the debug line "a hook answered without the request; the loop read what it streamed". `leak-test:guarded-hold` is the proof under the real guard.

## D-088: Any one sign seats the guard; the warning names hook context and is proven in CI; the org run uses a real archive
- Date / Step: 2026-11-02 / 6        Status: accepted
- Decision: (1) Docs and spec say managed settings, a managed MCP server file, or a Team or Enterprise login, any one enough. (2) The warning and doctor line name hook context and say "instruction files", not "project instruction files". (3) The pass-over reaches the plugin log, and the kit requires the warning in a guarded scenario that sent a request and forbids it in an org run. (4) The org run's marketplace folder is a real `git archive`, unpacked; `docs/managed.md` names `aegiscontext-<tag>` as that folder.
- Why: An outside review, each point checked. The docs' "and with" was wrong, so a Team user with no managed settings could think themselves safe. `hook-context` leaked 7 of 7 and went unnamed. The warning had never been seen in CI. The documented folder held no marketplace.
- Rejected: Requiring the warning per run (`compaction-held` run 2 and the resume door stop before any step, so they can't show it).
- Evidence: the 2.1.316 binary's seat function (`a||l||f`) and its strings, including "this machine has a managed MCP server file"; `claude-code.d.ts` `PromptContextInput` ("`@` imports included"); a scratch run with the sign removed showed the warning in the debug log, not on stdout and not in the plugin log; a scratch run with the snippet's settings pointed at the documented folder logged "Skipping orphaned enabledPlugins entry" and loaded no plugin, with the nested folder loading it.

## D-089: Skill text is a door, named in the warning and measured under the guard
- Date / Step: 2026-11-02 / 6        Status: accepted
- Decision: The warning, the refusal, the doctor line, the docs and spec §5.3 and §22 name skill text. The kit gains a `skill-text` door: a project skill read through the Skill tool. It joins `ORG_SCENARIOS` and `GUARDED_OPEN`, so it must stay clean in the org run, leak under the guard and be refused under `hold`.
- Why: The guard's list passes the Skill tool's `tool-message` rows over, and under `allow` nothing told the person. It was the one open item where a real secret could reach the model with no warning. The owner approved fixing it before the tag.
- Rejected: Recording it in Known issues only.
- Evidence: the 2.1.316 binary's `register` of `sec-default` (`isSkillRow`); on Windows, with no guard, the door shows 7 of 7 fakes with no tool and 0 of 7 with the plugin. D-087's and D-088's kit runs were green on all three systems in CI run 41339214316: org 0 of 91, guarded 14 of 91 (7 at each listed door), hold 0 of 14.

## D-090: Step 7: fixes before daily use, then `v0.1.0-rc.2`
- Date / Step: 2026-11-02 / 7        Status: accepted (approved with the step 7 plan)
- Decision: Five items are built on `step-7` before the two weeks of daily use start: skill text in the backup lock's limits, `/redact remove`, the doubled name, and the login and observe runs. The owner then tags `v0.1.0-rc.2`, and the daily use and hand checks run on that.
- Why: Daily use on rc.1 would not cover code added after it. A scratch run also showed the backup lock leaks skill text (7 of 7 fakes) with no doc saying so. The same run is now `leak-test:backup-limits`, so the limit is proven.
- Rejected: Putting the fixes after the two weeks, which would mean starting them again.
- Note: skill text can't be fixed in the backup lock as far as is known: it reaches the model as its own message, and the lock's hooks see prompts, tool calls and tool results. That cause was not traced, so the docs give only the measurement.

## D-091: `/redact remove`: a picker, with no value on the command line
- Date / Step: 2026-11-02 / 7        Status: accepted (approved with the step 7 plan)
- Decision: A pane lists saved values by label, date and length, newest first, with nothing ticked. The values stay in the worker's memory, never in `$.state`. Anything after the subcommand is refused and masked, as with `add`. It removes one or more, all or nothing, through `saveList`. A removed value stops being hidden on the next row, unless its shape matches a rule, and the message says so. The newest 200 are shown, and the pane says when there are more.
- Why: The only other way to undo a mistaken save was deleting the whole store. Deleting by value on the command line would put the secret in the transcript.
- Rejected: A "remove all" button; the documented uninstall already does that. Showing a hint of the value: password-label values never get one (spec §9). Paging past 200: spec §8.1 allows about 1,900, but nobody has a list that long yet.
- Trade-off: A value marked harmless with `/redact allow` in this session stays harmless until the session ends, because its tag is in `$.state`.
- Evidence: `plugin/hooks/lock.test.ts`, `tests/core-store.test.ts`; `session.ts` `exportCatches` keeps only the tag of a registered value.

## D-092: The guard's login path is measured with a made-up login; one host is let off the network rule there
- Date / Step: 2026-11-02 / 7        Status: accepted (approved with the step 7 plan)
- Context: D-088's seat function also seats the guard on a Team or Enterprise plan, which CI never tried because no account exists.
- Decision: `--guarded --login team|enterprise` writes a made-up `.credentials.json` into the run's own config folder and passes no API key. It needs no managed file, so it runs anywhere. The debug log must say "the organization is <plan>", which also proves no managed file was left behind. With a login, Claude Code tries `api.anthropic.com` as well as the mock, so a CONNECT to that one host doesn't invalidate these runs; the proxy still refuses it and the report prints it as "expected, refused". Every other attempt, and any plain request, still does.
- Why: It turns "should be the same" into a measurement. The rule is relaxed for the narrowest case: a refused CONNECT sends nothing, so the made-up token never leaves.
- Rejected: Setting up a real Team account in CI, which would put a real credential there.
- Limit: It proves the plan value seats the guard, not how a real account behaves. A new Claude Code version may change this path; the run then fails with "not seated".
- Evidence: the 2.1.316 binary's `yJr` and `gr()`; on Windows, team and enterprise seated it, and pro and no login did not; `leak-test:guarded-login` 21 of 98 at the `GUARDED_OPEN` doors, `-hold` 0 of 21.

## D-093: Observe from managed settings is measured on the organization install
- Date / Step: 2026-11-02 / 7        Status: accepted (approved with the step 7 plan)
- Decision: `--org --observe` adds `mode: observe` to the organization install's managed settings. Every fake must be seen, and each scenario's plugin log must hold a `would-hide` line and no real hide. Seeing every fake alone proves nothing, because a tool that never ran looks the same.
- Why: `docs/managed.md` tells organizations to start there, and it was the open part of plan step 5 item 6.
- Not covered: The backup lock in managed safe mode under `observe`, and the banner under `claude -p`, which has no screen.
- Evidence: a rehearsal with `mode: observe` in user settings: 98 of 98 seen, every scenario logged. The managed run itself is CI only (D-020).

## D-094: Release tags are signed with the maintainer's GPG key from `v0.1.0-rc.2` on
- Date / Step: 2026-11-02 / 7        Status: accepted
- Context: This reopens the signed-tags part of D-019, which parked them because `SHA256SUMS` covers integrity. The owner made them high priority: the checksums sit in the same release as the archives, so they catch corruption, not tampering, and this is a security tool asking to be trusted.
- Decision: Every release tag from `v0.1.0-rc.2` on is signed with `git tag -s`, and an unsigned tag blocks a release. The public key is on the maintainer's GitHub profile and its fingerprint in `SECURITY.md`. `v0.1.0-rc.1` stays unsigned, because a published tag is never moved or made again. No release is made until the key exists.
- Why GPG: In a scratch repo on Git 2.49 both kinds signed and verified. With GPG a stranger imports one public key and runs `git tag -v`. With SSH they must write an allowed-signers file first, and SSH keys have no expiry or revocation.
- Rejected: Signing only `v0.1.0`, which leaves rc.2 open to the same doubt. SSH signing. A key held in CI: the point is that the tag comes from the maintainer.
- Limit: The release workflow does not check the signature (Known issues), so the checklist's `git tag -v` is the check. A key lost or replaced means publishing the new fingerprint.
- Evidence: the scratch run; `https://github.com/Mrinanka.gpg` answers 200 and said no key was uploaded on 2026-11-02. A `.tar.gz` rebuilt from `v0.1.0-rc.1` on Windows had the same SHA-256 as the one CI made on Linux, which ties a signed tag to its archive; the `.zip` did not match, though the files inside the `.tar.gz` are the same 315 as the tag's.

---

## Minor

- 2026-11-02 / 7: The lowest-version hunt (old check 0.12) is closed: D-086 made the oldest tested version the stated minimum, so spec section 23 no longer lists it.
- 2026-11-01 / 5: The owner approved changing one line of `tests/core-settings.test.ts` (it expected "personal_data ... not available yet", which step 5 makes false by design, D-037). The test title above it said the setting "does nothing yet"; it was left as it was at first, because the approval was for the one line. After `/verify` the owner asked for the leftovers to be done, and the title was reworded (title only, same checks). The same went for three titles in `tests/checker-scan.test.ts` that named the removed repeated-line memory (D-074).
- 2026-10-31: "secret-shield" is a working name. The final name is chosen in part 6.4 (no "Claude" or "Anthropic" in it).
- 2026-10-31 / 0.0: NOTICE copyright line is "Copyright 2026 Mrinanka Dhar", with the project as "secret-shield (working name)" (renamed in 6.4).
- 2026-10-31 / 0.0: npm, not pnpm. pnpm isn't installed and npm ships with Node.
- 2026-10-31 / 0.0: `noUncheckedIndexedAccess` is on in `tsconfig.json`. Stricter than planned; no new dependency.
- 2026-10-31 / 0.0: `step-0` was branched from `develop` (commit f135454), the only local branch.
- 2026-10-31 / 0.0: GitHub repo created by the owner as `Mrinanka/agent-redact`. The repo name is not yet the product's final name (that's part 6.4; spec still says "secret-shield").
- 2026-10-31 / 0.0: One-time exception to CLAUDE.md "Never push": the owner told Claude to push `develop` and `step-0` ("you do it man i gave you everything"). The rule itself is unchanged.
- 2026-10-31 / 0.A: The probe records only fields on an allow-list. Any recorded string that doesn't look like a name or id is written as `(odd)`.
- 2026-10-31 / 0.A: The probe's tests run under `claude plugin test` on the owner's machine only, because CI has no `claude` installed.
- 2026-10-31 / 0: Probe bumped to 0.2.0 (opt-in checks added). The owner approved changing the one test that expected `0.1.0`. Also approved earlier: the 0.4 test expects no AES (`subtle:false`), and the 0.3 hold test no longer reads `.result` (test-kit bug).
- 2026-10-31 / 0: Spec §7.2 no longer writes AWS's example key whole (CLAUDE.md docs rule; the secret scanner flagged it). The owner approved.
- 2026-10-31 / 0: The probe and the step 0 mock stay in `experiments/` for re-checks when Claude Code updates (D-016 revisit; the owner didn't object).
- 2026-10-31 / 1: Plan 1a gained two doors, project `CLAUDE.md` and settings-hook context, and one item, the network proof (approved in the step 1 plan).
- 2026-10-31 / 1: The owner approved a wip commit and push of `step-1` before `/verify`, so the 3-OS CI could finish checks 0.4 and 0.13. A follow-up wip commit fixed a guard test pattern.
- 2026-10-31 / 1: The kit's fakes are random each run; the test sets use a fixed seed, so scores compare between releases.
- 2026-10-31 / 1: `tools/test-sets/whole-keys.ts` and the key shapes in `tests/fakes.test.ts` were written by hand after reading Gitleaks v8.30.1, and some match its patterns exactly. They count as format facts under D-008, so step 1 merges without `THIRD_PARTY_LICENSES`; step 2 lists them when it creates that file. The owner chose this option.
- 2026-10-31 / 2: `THIRD_PARTY_LICENSES` created with Gitleaks, listing `whole-keys.ts` and the key shapes in `tests/fakes.test.ts`.
- 2026-10-31 / 2: One item added to the speed set (`adversarial-all-keywords`); existing items and tests untouched.
- 2026-10-31 / 2: A scratch mod under `claude plugin test` (2.1.316, Windows) showed the mod runtime has the `d` flag, sticky, lookbehind, named groups and `(?i:` modifiers, and runs the checker in 6 to 400 ms on the speed items (about 1 to 4 times Node). The checker uses none of the newer features except `d`, with a fallback.
- 2026-11-01 / 3: The owner approved narrowing the "no Node globals" guard in `tests/plugin-build.test.ts`, whose `process.` pattern matched `$.process`, the engine's API. The change also skips a quoted event name (`on('process.run', ...)`), which the same guard tripped on in the hook tests. A test proves it still catches Node's `process`.
- 2026-11-01 / 3: `LICENSE`, `NOTICE` and `THIRD_PARTY_LICENSES` are copied into `plugin/` by `npm run plugin:build`, because an install may copy that folder alone.
- 2026-11-01 / 3: A 3 MB paste of `[REDACTED:` makes `claude -p` exit 1 with no request, with no plugin loaded too. It isn't the tool's doing.
- 2026-11-01 / 4: The owner parked the step 4 hand checks and shipped the step without them. They stay in progress, Known issues, to run before release.
- 2026-11-01 / 3: The owner approved adding "Very long values" to spec §22 and a one-time warning when a value is too long to remember, after `/code-review high`. D-052 stands. Its "hidden where it was found" also means a bare copy later in the same text stays visible, which a scratch run showed at 8,193 characters and not at 8,192.
- 2026-11-01 / 5: The first CI run of step 5 failed on all three systems in the managed safe-mode run: the MCP door came out INVALID (no witness), because `claude --safe-mode` starts no MCP servers (its help text lists them). `leak-test:managed` now runs the other six doors with `--only`. The MCP door stays covered by `leak-test:backup` (user hooks, no safe mode).
