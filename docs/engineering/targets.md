# Targets

The numbers a release has to meet (plan, "Release rules"). Set by the maintainer on 2026-11-01 from the measurements below, with room for machines that were not measured. `tools/measure/targets.ts` holds the same numbers, `npm run measure` fails when one is missed, and `tests/targets.test.ts` fails if this file and that one disagree. Any change to a number goes in the changelog.

## The targets

| What | Target | Measured on 2026-11-01 | How it is measured |
|---|---|---|---|
| Speed: any item of the speed set, one call through the matcher, checker and decoder | at most **1,500 ms** | slowest item 312 to 645 ms over several runs (2 MB of text 20 to 115 ms; 2 MB of base64 about 450 ms; 1 MB built to slow the patterns down 120 to 645 ms) | `npm run measure`, section 6 |
| Speed: the backup lock, a cold Node process handling one small event | median at most **500 ms** | median 107 to 113 ms; 174 ms for a 2 MB tool output; 57 ms when it stands down | `npm run measure`, section 8 |
| Catch rate: the catch set, through the whole pipeline | at least **135 of 138** (97.8%), and every case in the 8 in-scope contexts | 135 of 138 | `npm run measure`, sections 2 and 6 |
| Code set: harmless code left alone | **41 of 41** | 41 of 41 | `npm run measure`, section 3 |
| Code set twins: a real-looking value in the same spot is hidden (R-08) | **81 of 81** | 81 of 81 | `npm run measure`, section 3 |
| False alarms per MB, source files read with their file name | at most **6.5** | 5.55 | `npm run measure`, section 6 |
| False alarms per MB, the same files with no file name (all Bash output) | at most **90** | 76.30 | `npm run measure`, section 6 |
| False alarms per MB, log-like text | at most **250** | 214.33 | `npm run measure`, section 7 |

The 3 cases that are not caught are a bare value in base64 with no shape and no label (spec §22, D-046).

## What changed in step 5

The false-alarm figures at the start of step 5 and at the end, on the same sets:

| Per MB | Start of step 5 | End of step 5 | What did it |
|---|---|---|---|
| Source files, with the file name (pipeline) | 5.55 | 5.55 | nothing changed |
| Source files, no file name (checker alone) | 60.69 | 55.14 | a type alias is code whatever the file is called |
| Source files, no file name (pipeline) | 350.28 | 76.30 | a letters-only value found only by a label is not remembered (D-071) |
| Log-like text (checker alone and pipeline) | 404.8 | 214.33 | prose after a colon, such as `token: signature mismatch`, is left alone |

Kept on purpose: `generic-api-key` hides 136 hex values per 1.05 MB of logs (`cache key=` followed by 32 hex characters). Many real API keys are 32 hex characters, so leaving these alone would leak real keys. It is the largest false-alarm class, by choice.

The repeated-line skip was removed (D-074): 160 of 219 rules can match across a newline, so it skipped almost nothing, and measured warm it gained between -15% and 13%, which is noise.

## How to read these numbers

- **One computer.** Measured on the maintainer's Windows 11 PC with Node 24.22.1. macOS and Linux were measured by CI only after this file was written; if they differ, the targets above are what to meet, and a miss is fixed or the target is changed with a note in the changelog.
- **The log set was written by the same person who tuned the checker against it** (`tools/test-sets/logs.ts`), so read it as our own benchmark, not an independent one. It is a first set, public and rerunnable. Its mix (how many lines carry a label word) is a judgment, and a different mix gives different per-MB figures. The source-file set (the TypeScript and `@types/node` sources) is not written by us.
- **The catch set is ours too.** 138 cases of the formats and contexts we thought of.
- **Speed in a real session** also includes starting Claude Code's hook process. On Windows, a session with saved secrets starts PowerShell for about one second per hook of the backup lock (spec §22); that is not in these figures.
