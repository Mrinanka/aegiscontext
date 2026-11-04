<p align="center"><img src="docs/media/aegiscontext-icon.png" alt="AegisContext logo" width="120"></p>

# AegisContext

**Keep API keys, passwords and tokens out of Claude's context.** AegisContext is a [Claude Code](https://claude.com/claude-code) plugin that swaps each secret for a placeholder before the model sees it. Claude keeps working: it knows a secret is there, but never sees the value.

![A config file scrolls up through a red line. Below the line is the file as it is on disk; above it is what the model is sent. Ordinary lines cross unchanged; an AWS key and a password come out as placeholders such as [REDACTED:AWS_ACCESS_TOKEN ...4P3A #k7q2m5x4p3abc].](docs/media/aegiscontext-loop.gif)

Below the line, a config file on your machine (fake keys). Above it, what the model is sent: the placeholders are the tool's real output.

- **Every door checked.** What you type and paste, every file Claude reads (`@` files too), command output (failed commands included), MCP tool results, subagents' work, project instruction files and compaction summaries. Emails and phone numbers too, if you switch `personal_data` on.
- **Claude stays useful.** A placeholder such as `[REDACTED:AWS_ACCESS_TOKEN ...7QXZ #k7q2m5x4p3abc]` gives the kind, the last four characters (you can turn that off) and a random tag. If a known secret still turns up in a command, web request or connected tool, a last check blocks the call before it runs.
- **The tool itself never touches the network.** No network calls, no telemetry, no runtime libraries: everything that runs is in this repo. Secrets you register live in your OS password store, and it never writes a secret to disk unencrypted. (The one optional exception, `put_back`, is off by default.)
- **Hard to talk out of its job.** Claude's tool calls that try to change its settings, saved secrets or hooks are denied. That is its defence against a poisoned web page or file telling Claude to switch it off. A backup lock, an optional safety net, keeps watch if the main lock ever stops.
- **Proven, not promised.** A leak test kit plants fake secrets at every door and fails if the model sees even one. On the public catch set it catches 135 of 138 (97.8%): every case with a known shape or label. The other 3 are bare base64 with no shape and no label, which is what registering a secret is for. It leaves 41 of 41 harmless code samples alone ([scores, and how to read them](docs/scores.md#how-to-read-these)).

> **On a work machine?** If it has managed settings or a managed MCP server file, or you sign in with a Team or Enterprise plan, Claude Code's built-in guard routes some events past a user-installed plugin. `/redact doctor` tells you, and the [organization install](docs/managed.md) closes the gap.

## Install (2 minutes)

In Claude Code:

```
/plugin install aegiscontext --marketplace Mrinanka/aegiscontext
```

Restart the session, then check it is running:

```
/redact doctor
```

It should say the main lock is running. No `/redact`? Run `/aegiscontext:doctor`: it works even when the hooks don't, and tells you why. Details: [docs/personal.md](docs/personal.md). To pin a version, add `@<tag>` to the repository name.

Requires Claude Code 2.1.309 or later. Tested in real development work and still being tested with each Claude Code release; the latest tested is 2.1.318. Details: [docs/tested-versions.md](docs/tested-versions.md).

### Add the backup lock (recommended)

A second, separate layer. It runs the same checker as plain settings hooks, outside the plugin system, so it takes over the moment the main lock is not alive (a crash, or a policy that blocks plugin hooks). Being outside the plugin system is also why it covers fewer doors ([the list](docs/personal.md#the-backup-lock)). It needs [Node](https://nodejs.org) on the PATH.

```
/redact backup
```

copies it into your Claude folder and prints the settings to paste into `~/.claude/settings.json`. See [docs/personal.md](docs/personal.md).

## Prove it yourself

Don't take our word for it: run it. The repo ships a **leak test kit**: a local server stands in for the model API, Claude Code is pointed at it, and planted fake secrets go through every door: typed and pasted prompts, file reads, `@` files, command output, MCP results, subagents, compaction, resumed sessions, instruction files, hook context and skill text. Any fake the server sees is a failure. No API key and no network. See [docs/verify.md](docs/verify.md). Published numbers: [docs/scores.md](docs/scores.md).

## Use

| Command | What it does |
|---|---|
| `/redact` | Status of both locks, the mode, and what was hidden this session |
| `/redact add [--label name]` | Register a secret of your own, pasted into a box (never on the command line) |
| `/redact learn` | Pick secrets from your `.env*` files |
| `/redact remove` | Pick saved secrets to remove, by label (it shows no values) |
| `/redact allow <tag>` | Mark a hidden value as harmless (`--always` to remember it) |
| `/redact put-back [on\|off] [--here]` | Show, or choose, whether Claude's file writes get hidden values put back into a file that already holds them. Off by default; we recommend keeping it off |
| `/redact backup` | Copy the backup lock and print its settings |
| `/redact self-check` | Built-in test cases; `--report` writes a shareable result |
| `/redact doctor` | Checks the environment and says what to fix |

Settings are optional and live under an `aegisContext` key in Claude Code's settings files. Projects can only tighten them. The one exception is the optional `put_back`, off by default (we recommend keeping it off). [docs/personal.md](docs/personal.md) lists them.

## Where the edges are

The job: find every secret with a known shape or label, and let you register the rest. Built to stop accidental leaks and prompt injection. It is **not a guarantee** and not a compliance certification.

Outside the goal, by design:

- **Secrets with no shape.** A secret with no known format and no label, even inside base64, looks like any other text to every detector. That is what registering is for: it is found once you register it (`/redact add`, `/redact learn`) or once it has been caught in the session.
- **Deliberate evasion.** Someone who scrambles or splits a secret on purpose can get past it. It is built to stop accidents.
- **Images and documents** (such as PDFs) are not scanned in this version. By default they pass through with a one-line notice; the `media: drop` setting removes them and tells Claude it did.

Set by Claude Code, outside any plugin's control:

- **Claude Code's built-in guard.** With managed settings, a managed MCP server file, or a Team or Enterprise login, Claude Code routes some events (instruction files, hook context, skill text, attachments) past a user-installed plugin. Compaction summaries pass too, but the resume check finds them and holds the next message, so the model is not sent one. `/redact doctor` tells you, and the [organization install](docs/managed.md) closes it.
- **What was already sent** before the plugin was installed, or before a secret was registered, cannot be taken back. A resumed session that holds old secrets is held until you decide.
- **Claude Code's own disk records** (file backups, saved large outputs, the session transcript) stay as Claude Code writes them.
- **Switches that turn plugins off:** `--safe-mode`, `--bare`, `CLAUDE_CODE_SIMPLE=1`, a project's `disableAllHooks`, an organization's `allowManagedHooksOnly`. `/aegiscontext:doctor` says so.

Edges of the safeguards and optional parts:

- **Self-protection reads a shell command's text,** so a disguised command, including one a prompt injection asks for, can get past it.
- **The backup lock** is a safety net for when the main lock is down, so its scope is narrower by design, and measured: [its list](docs/personal.md#the-backup-lock).
- **Put-back** is optional and off by default. Turned on, a save can replace a value it cannot restore: [read this first](docs/personal.md#put-secrets-back-optional-off-by-default).

Full list: [section 22 of the spec](docs/engineering/spec.md).

## For an organization

An administrator installs the plugin in the `prepend` tier through managed settings: no user plugin can skip it, and settings can be locked. On a machine with managed settings or a Team or Enterprise login, this is the install that leaves no door open (`npm run leak-test:org` proves it). [docs/managed.md](docs/managed.md) has ready-to-use settings for macOS, Windows and Linux.

## Uninstall

Remove the plugin with `/plugin uninstall aegiscontext`. Saved secrets stay in your OS password store until you delete them: [docs/personal.md](docs/personal.md#uninstall) has the exact commands for macOS, Windows and Linux.

## Help

Check a download or run the leak tests yourself: [docs/verify.md](docs/verify.md). Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md). Bugs: open an issue and include the output of `/redact doctor`. Security problems: [SECURITY.md](SECURITY.md), privately. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Every guide: [docs/](docs/README.md). The full engineering record (spec, decisions, measurements): [docs/engineering/](docs/engineering/README.md).

## Licence

Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)). The detection rules are the [Gitleaks](https://github.com/gitleaks/gitleaks) rule set (MIT), credited in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES), plus its own rules. Provided "as is".
