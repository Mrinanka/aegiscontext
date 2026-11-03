# AegisContext

**Secrets stay out of the model's context.** AegisContext is a [Claude Code](https://claude.com/claude-code) plugin that swaps passwords, API keys and tokens for placeholders before the model sees them. Claude can still do its job: it knows a secret is there, but never sees the value.

> It reduces the risk of a leak. It is **not a guarantee** and not a compliance certification. Read [what it cannot do](#what-it-cannot-do) before you rely on it.

It checks what you type, what you paste, every file Claude reads, every command's output, connected tools' results, subagents' work, project instruction files and compaction summaries. A hidden value looks like `[REDACTED:AWS_KEY ...0001 #k7q2m5x4p3abc]`: the kind, the last four characters (you can turn that off), and a random tag. It can also hide emails and phone numbers if you switch `personal_data` on.

It uses **no network**, has **no runtime libraries** (everything that runs is in this repo), and never writes a secret to disk unencrypted (the one optional exception, `put_back`, is off by default).

## Install (2 minutes)

In Claude Code:

```
/plugin install aegiscontext --marketplace Mrinanka/aegiscontext
```

Restart the session, then check it is running:

```
/redact doctor
```

It should say the main lock is running. If `/redact` does not exist, the hooks are not running; run `/aegiscontext:doctor` instead, which works even then and says why. Details: [docs/personal.md](docs/personal.md). To pin a version, add `@<tag>` to the repository name.

Requires Claude Code 2.1.309 or later. Tested versions: [docs/tested-versions.md](docs/tested-versions.md).

### Add the backup lock (recommended)

The main lock is a plugin. If its hooks stop (a crash, or a policy that blocks plugin hooks), nothing would be checking. A second, smaller check runs as settings hooks and takes over when the main lock is not alive. It needs [Node](https://nodejs.org) on the PATH.

```
/redact backup
```

copies it into your Claude folder and prints the settings to paste into `~/.claude/settings.json`. See [docs/personal.md](docs/personal.md).

### For an organization

An administrator installs the plugin in the `prepend` tier through managed settings, where no user plugin can skip it and settings can be locked. [docs/managed.md](docs/managed.md) has ready-to-use settings for macOS, Windows and Linux. **On a machine with managed settings, or a Team or Enterprise login, a user-installed copy is partly bypassed by Claude Code's own guard; only the organization install avoids that** (see below).

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

Settings are optional and live under an `aegisContext` key in Claude Code's settings files. A project can only make them stricter, except that it can ask for the optional `put_back`, which is off by default and which we recommend keeping off. [docs/personal.md](docs/personal.md) lists them.

## Prove it to yourself

You do not have to take our word for it. The repo ships a **leak test kit**: a local server pretends to be the model API, Claude Code is pointed at it, and planted fake secrets go through every door. Any fake the server sees is a failure. No API key and no network. See [docs/verify.md](docs/verify.md). Published numbers: [docs/scores.md](docs/scores.md).

## What it cannot do

- **Secrets with no shape.** A secret with no known format, no label, never registered and never seen before cannot be found by any tool. Registering your secrets (`/redact add`, `/redact learn`) and "once caught, always caught" shrink the gap.
- **What was already sent.** Anything sent before the plugin was installed, or before a secret was registered, cannot be taken back.
- **Claude Code's own disk records** (file backups, saved large outputs, the session transcript) stay as Claude Code writes them.
- **Claude Code's built-in guard.** On a machine with managed settings or a managed MCP server file, or with a Team or Enterprise login (any one is enough), Claude Code routes some events (instruction files, hook context, skill text, attachments, compaction) past a user-installed plugin. AegisContext warns once per session and in `/redact doctor`, and under `on_check_failure: hold` it refuses to send the request. Only the organization install fixes it.
- **It can be switched off in Personal mode.** `--safe-mode`, `--bare`, a project's `disableAllHooks`, and an organization's `allowManagedHooksOnly` turn the plugin off. `/aegiscontext:doctor` says so.
- **Images and documents** are passed or dropped, never read.
- **A person who splits or scrambles a secret on purpose** gets past it. It stops accidents.

The full list is [section 22 of the spec](docs/spec.md).

## Uninstall

Remove the plugin with `/plugin uninstall aegiscontext`. Saved secrets stay in your OS password store until you delete them: [docs/personal.md](docs/personal.md#uninstall) has the exact commands for macOS, Windows and Linux.

## Help

Check a download or run the leak tests yourself: [docs/verify.md](docs/verify.md). Troubleshooting: [docs/troubleshooting.md](docs/troubleshooting.md). Bugs: open an issue and include the output of `/redact doctor`. Security problems: [SECURITY.md](SECURITY.md), privately. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Design: [docs/spec.md](docs/spec.md).

Other tools use the name "Aegis" for related things (for example a secrets detector for Claude Code that runs as an MCP server, and a Kubernetes secrets store). This is a different project.

## Licence

Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)). The detection rules are the [Gitleaks](https://github.com/gitleaks/gitleaks) rule set (MIT), credited in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES). Provided "as is".
