# Changelog

All notable changes. Versions follow [Semantic Versioning](https://semver.org). A change to a default is called out under **Changed defaults**.

## 0.1.0-rc.2 (release candidate)

Fixes from the review of rc.1, made before the two weeks of daily use so that they cover the final code.

### Added

- `/redact remove`: pick saved values to remove, by label, date and length. It also undoes `/redact allow --always`.
- Put-back (D-096), **off by default**: `/redact put-back [on|off] [--here]` and a `put_back` setting. When Claude writes a file that already holds a hidden value, the value is put back as the file is saved, so Claude can reorganize a config it has only seen redacted. It restores only into a file that already holds the value, through Write and Edit, and never more copies than the file had. A managed `off` binds; a project can ask for `on`, with a notice naming the repo. A save can erase a real secret it cannot restore (git or Claude Code's file backups are the way back), so the docs recommend keeping it off. See `docs/personal.md`.
- A weekly CI run against the newest Claude Code, as an early warning (`.github/workflows/weekly.yml`).

### Changed

- The plugin's name no longer shows twice on warnings and log lines.
- The backup lock's limits now name skill text, which it does not cover.
- Only with put-back on (off by default): the overwrite guard reports instead of blocking a Write or Edit that replaces a real secret with its placeholder. A NotebookEdit is still guarded.

### Measured

- That a mod's rewrite of a Write or Edit input reaches the tool and not the next request, on macOS, Windows and Linux (`tests/rewrite-real.test.ts`), and every door with put-back on and off (`npm run leak-test:put-back`, `leak-test:put-back-off`).
- The built-in guard under a Team or Enterprise login (`npm run leak-test:guarded-login`), and the organization install in observe mode (`npm run leak-test:org-observe`).

### Release

- Tags are signed with the maintainer's GPG key from this version on. `v0.1.0-rc.1` is not signed. See `docs/verify.md`, "Check a release".

No default changed.

## 0.1.0-rc.1 (release candidate)

The first public release candidate. `v0.1.0` follows two weeks of daily use and the hand checks in `docs/release-checklist.md`.

### What it is

- A Claude Code plugin (the main lock) that hides secrets in everything the model would see: typed and pasted prompts, files Claude reads, `@` files, command output, connected tools' results, subagents' work, project instruction files, injected context and compaction summaries.
- A backup lock (settings hooks, needs Node) that takes over when the main lock is not alive.
- Registered secrets in the OS password store, `/redact add`, `learn` and `allow`, an outbound check on commands and web requests, an overwrite guard, observe mode, optional personal-data hiding, and a self-protection check.
- The leak test kit, the `/redact self-check` and `/redact doctor` commands, published scores and tested versions.

### Defaults

`mode: enforce`, `outbound: block`, `on_check_failure: allow` (with a warning), `media: pass`, `personal_data: off`, `hints: on`, `notices: on`, `secret_files: .env*`, `log.days: 30`. These are the first defaults; any later change is listed here.

### Known limits

See `docs/spec.md` section 22 and the README. The main ones: secrets with no known shape, content sent before the tool was installed, Claude Code's own disk records, and **Claude Code's built-in guard**, which on a machine with managed settings or a managed MCP server file, or with a Team or Enterprise login, routes some events past a user-installed plugin (under `on_check_failure: hold` the plugin refuses the request). Only the organization install (`docs/managed.md`) avoids it.

### Name

The working name was `secret-shield`. NoCreds was the first final choice; the name is AegisContext (plugin `aegiscontext`, settings key `aegisContext`, data folder and store service `aegiscontext`). Nothing was published under an earlier name.
