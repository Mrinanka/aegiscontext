# Tested versions

AegisContext hooks into Claude Code, so it is only as good as the Claude Code it was tested with. This list is published with each release and is the same list `/redact doctor` and the session-start warning use (`src/core/versions.ts`).

## This release (v0.1.0-rc.2)

| Claude Code | Where | How it was checked |
|---|---|---|
| **2.1.316** (the pinned version) | CLI, on macOS, Windows and Linux | The whole test suite and the leak test kit in CI on all three (`npm run leak-test`, `leak-test:backup`, `leak-test:backup-limits`, `leak-test:managed`, `leak-test:org`, `leak-test:org-observe`, `leak-test:guarded`, `leak-test:guarded-login`). The backup lock also runs under Node 20 and 22 on Linux and Windows. |
| **2.1.309** (the `stable` channel when this was checked) | CLI, on Windows | The full kit by hand, from a scratch install, with the plugin: the baseline saw 98 of 98 fakes and the plugin run saw 0 of 105, at 14 doors and the registered-value door. Not run in CI, and not run on macOS or Linux. |
| **2.1.314** | The VS Code extension, which runs its own copy of Claude Code | Step 0 check 0.10, by hand on Windows: hiding works in the panel. Not run by the kit. |

The pinned version is the one in `tools/leak-test/claude-pin/package-lock.json`. A newer Claude Code keeps working, with a one-line warning at session start; run `/redact self-check` and, if you can, the kit.

## Not yet checked

- The Code tab of the desktop app: not reported. Its Claude Code version was not recorded; check it by hand before v0.1.0 ([release-checklist.md](release-checklist.md)).
- The desktop app's WSL sessions: plugins are not available there.
- Claude Code on the web and Agent SDK hosts: not covered.

## Systems

macOS, Windows and Linux, all first-class (CI runs on the three). WSL and devcontainers count as Linux.
