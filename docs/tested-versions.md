# Tested versions

AegisContext hooks into Claude Code, so it is only as good as the Claude Code it was tested with. This list is published with each release and is the same list `/redact doctor` and the session-start warning use (`src/core/versions.ts`).

AegisContext is tested in real day-to-day development by its maintainer, and that testing goes on with each new Claude Code release. The latest is 2.1.318: in the terminal, the VS Code extension and the desktop app's Code tab, on Windows and on macOS/Linux, hiding works as expected.

## How a version joins the list

A pull request adds it to `src/core/versions.ts`. CI then runs the plugin tests and the whole leak test kit on that exact version, on macOS, Windows and Linux (`.github/workflows/versions.yml`). CI can run only the CLI, so before merging the maintainer checks the VS Code extension and the desktop app's Code tab by hand.

## v0.1.0-rc.5

The same list as `v0.1.0-rc.4`, below: no Claude Code version was added. `v0.1.0-rc.4` was tagged but never released, so this release is the first with that list.

## v0.1.0-rc.4

| Claude Code | Where | How it was checked |
|---|---|---|
| **2.1.318**, **2.1.315**, **2.1.312**, **2.1.311** (the `stable` channel on 2026-11-04), **2.1.310** | CLI on macOS, Windows and Linux; the VS Code extension and the desktop app's Code tab | The plugin tests and the whole leak test kit in CI, on each version and each system (`versions.yml`), and the maintainer's check by hand before merging. |

## v0.1.0-rc.3

| Claude Code | Where | How it was checked |
|---|---|---|
| **2.1.317** (the pinned version) | CLI, the VS Code extension and the desktop app's Code tab | Real development work by the maintainer, on Windows and on macOS/Linux. The kit on Windows: the baseline saw 105 of 105 fakes and the plugin run saw 0 of 112, at 16 doors. It is the version CI pins, so the whole test suite and the leak test kit run on it on macOS, Windows and Linux. |
| **2.1.316** (the previous pin) | CLI, on macOS, Windows and Linux | The whole test suite and the leak test kit in CI on all three (`npm run leak-test`, `leak-test:backup`, `leak-test:backup-limits`, `leak-test:managed`, `leak-test:org`, `leak-test:org-observe`, `leak-test:guarded`, `leak-test:guarded-login`). The backup lock also runs under Node 20 and 22 on Linux and Windows. |
| **2.1.314** | The VS Code extension, which runs its own copy of Claude Code | Step 0 check 0.10, by hand on Windows: hiding works in the panel. |
| **2.1.309** (the `stable` channel when this was checked) | CLI, on Windows | The full kit by hand, from a scratch install, with the plugin: the baseline saw 98 of 98 fakes and the plugin run saw 0 of 105, at 14 doors and the registered-value door. |

Step 8 added `leak-test:put-back` and `leak-test:put-back-off` (20 doors each, 0 of 140 planted fakes seen on 2.1.316 on Windows when they were built) and the rewrite test (`tests/rewrite-real.test.ts`, which showed on macOS, Windows and Linux that a mod's rewrite of a Write or Edit input reaches the tool and not the next request). CI runs both on all three systems.

The **weekly run** (`.github/workflows/weekly.yml`) tries the newest Claude Code every week as an early warning, ahead of the maintainer's own testing.

The pinned version is the one in `tools/leak-test/claude-pin/package-lock.json`. A newer Claude Code keeps working. Its first two sessions show a one-line warning, and `/redact doctor` keeps saying it until the version joins this list; run `/redact self-check` and, if you can, the kit.

## Not supported

- The desktop app's WSL sessions: plugins are not available there.
- Claude Code on the web and Agent SDK hosts.

## Systems

macOS, Windows and Linux, all first-class (CI runs on the three). WSL and devcontainers count as Linux.
