# Troubleshooting

Start with `/redact doctor`. If `/redact` is not a command, the hooks are not running: use `/aegiscontext:doctor`, which still answers and says why.

## `/redact` does not exist

The plugin's hooks are not running. Common causes:

- The session started before the install. Restart it.
- `--safe-mode`, `--bare` or `CLAUDE_CODE_SIMPLE=1` is on.
- A project's `.claude/settings.json` sets `disableAllHooks`.
- Your organization sets `allowManagedHooksOnly`. A user-installed plugin loads no hooks then; ask your administrator for the organization install ([managed.md](managed.md)).

In all these cases the main lock is off. The backup lock, if installed as managed hooks, still runs in safe mode.

## doctor says "some events are passed over this plugin"

Claude Code's built-in guard routes instruction files, hook context, skill text, attachments and compaction summaries past a user-installed plugin on machines with managed settings or a managed MCP server file, or with a Team or Enterprise login. A compaction summary is still caught afterwards: the resume check holds the next message, so the model is not sent it. Under `on_check_failure: hold` the plugin refuses every request, and says "this request was not sent". A user-installed plugin can't change the routing; the organization install does, so ask your administrator for it ([managed.md](managed.md)).

## doctor says the password store is missing or locked

- **Linux:** install `libsecret-tools` and a keyring (for example `gnome-keyring`), and unlock it. Over SSH or in a container there may be no keyring.
- **macOS:** unlock the login Keychain.
- **Windows:** needs PowerShell; check that `powershell` runs.

Until it works, shapes and labels are still hidden; saved secrets are not hidden by value.

## doctor says Claude Code is not on the tested list

It keeps working. The warning pops up on the first two sessions with a new Claude Code version, then only doctor says it. Run `/redact self-check` and, if it passes, carry on. Tested versions: [tested-versions.md](tested-versions.md).

## Too many false alarms

Run in `observe` mode for a few days and read the log (`<Claude folder>/aegiscontext/log/`). Use `/redact allow <tag>` for one value, `allow` for patterns, or `rules.off` for a rule that does not suit your code. Details: [personal.md](personal.md).

## A request was held, or "history contains N secrets"

A resumed session held secrets from before the plugin was installed, and sending them again would leak them. Rotate those secrets. `/redact allow` with no tag lifts the hold for the next message.

## Claude cannot rewrite a config file, or an Edit on a placeholder line fails

That is the default. Claude only sees placeholders, so the overwrite guard refuses a rewrite that would replace a real secret with its placeholder, and an Edit on a placeholder line finds no such text. Ask Claude to change only the lines it needs, or turn on the optional put-back and read its risks first: [personal.md](personal.md#put-secrets-back-optional-off-by-default).

## Put-back is on and a value stayed a placeholder

`/redact put-back` says whether it is on and why. A value is put back only into a file that already holds it, only through Write and Edit, and only as many times as the file held it. It stays a placeholder when the file is new, when Claude wrote the placeholder more times than the file held the value, after `/resume` (this session never read the file), when the value is over 8,192 characters or the list of caught values is full, when the file holds the value in two written forms, or when the rule that found it is set to `warn` or `block`. A screen line and the log say how many were restored and how many were not. If a save replaced a real secret, restore it from git or from `~/.claude/file-history/`.

## The backup lock does not act

It stands down while the main lock is alive. If doctor says the hooks are missing, run `/redact backup`. It needs Node on the PATH. In Managed mode check that the hooks set `onFailure: "block"`.

## Reporting a bug

Open an issue with the output of `/redact doctor` and the file from `/redact self-check --report`. Never paste a real secret. A secret that reached the model is a security report: [SECURITY.md](../SECURITY.md).
