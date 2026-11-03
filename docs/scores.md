# Scores

What the tool catches, what it wrongly hides, and how fast it is, for this release (v0.1.0-rc.3). Produced by `npm run measure` (Node 24.22.1, a Windows 11 PC; CI prints the same numbers on macOS and Linux). The targets and how they were set are in [targets.md](engineering/targets.md).

| What | Result | Target |
|---|---|---|
| Catch rate, whole pipeline, public catch set | 135 of 138 (97.8%) | at least 135 |
| Harmless code left alone (R-08) | 41 of 41 | 41 |
| Real-looking values in the same spots hidden (twins) | 81 of 81 | 81 |
| False alarms per MB, source files read with their file name | 5.55 | at most 6.5 |
| False alarms per MB, the same files with no file name (all command output) | 76.30 | at most 90 |
| False alarms per MB, log-like text | 214.33 | at most 250 |
| Slowest speed-set item, one call | 490 ms (2 MB of base64) | at most 1,500 ms |
| Backup lock, a cold Node process handling one small event | median 88 ms | at most 500 ms |

**135 of 138: every case in the set with a known shape or label is caught.** The other 3 are a bare value in base64 with no shape and no label, which no detector can tell from any other base64 (spec section 22). That is what registering a secret is for. A test (`tests/core-redact.test.ts`) checks that these 3 are the only misses. Once registered or caught earlier, such a value is found even in base64.

## How to read these

- **The sets are ours, and public.** The catch set (138 cases of the formats and contexts we thought of) and the log-like set were written by the person who tuned the checker, so read them as our own benchmark, not an independent one. Anyone can rerun them with `npm run measure`. An independent hidden test set is parked for after v1 (spec section 23).
- **Log noise is mostly on purpose.** 136 of the 225 log-set false alarms are 32-hex values after `key=`; many real API keys look the same, so they stay hidden on purpose.
- **One computer.** Speed was measured on one machine. A session also pays for starting Claude Code's hook process; on Windows with saved secrets the backup lock starts PowerShell for about a second per hook that acts.
- **Rules.** 219 of the 222 Gitleaks v8.30.1 rules are used. Three are left out and why is in the decision log (D-032, D-038).
