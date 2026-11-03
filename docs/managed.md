# Managed mode: install for an organization

For an administrator who rolls AegisContext out to many machines. The plugin then runs in the `prepend` tier, outermost: no user plugin can skip it, a user cannot switch it off, and settings can be locked.

## Why the organization install

It closes two gaps a personal install can't:

1. **The built-in guard.** On a machine with managed settings or a managed MCP server file, or with a Team or Enterprise login (any one is enough), Claude Code seats a guard plugin (`sec-default@builtin`) outermost and routes some events past user-tier plugins: instruction files, hook context, skill text, attachments, the instructions note, compaction, and some rows. (A compaction summary is then found by the resume check, which holds the next message, so the model is not sent it.) A user-installed copy cannot close that; under `on_check_failure: hold` it refuses every request instead. The organization install can, because `prependPlugins` lets you seat AegisContext outside the guard. `npm run leak-test:guarded` measures what the guard passes over; `npm run leak-test:org` proves the organization install leaves nothing open (both run in CI).
2. **Only a folder marketplace reaches `prepend`.** A plugin fetched from GitHub or a git URL counts as a user's. The marketplace must be a folder on each machine, with the plugin entry given as a relative path.

## What you need on each machine

1. **A marketplace folder** holding the release: check the signed tag ([verify.md](verify.md#check-a-release)), verify a release archive (`aegiscontext-<tag>.tar.gz` or `.zip`) against `SHA256SUMS`, then unpack it into a folder of your choice, for example `/opt` (macOS, Linux) or `C:\Program Files\AegisContext` (Windows). The archive holds one folder, `aegiscontext-<tag>` (for example `aegiscontext-v0.1.0-rc.2`), and **that folder is the marketplace folder**: it holds `.claude-plugin/marketplace.json` and `plugin/`. A path one level off loads no plugin and shows no error on screen, so run the check below on one machine first.
2. **Managed settings** that name the folder, enable the plugin, and list it first in `prependPlugins`: [snippets/managed-plugin.json](snippets/managed-plugin.json), with `<MARKETPLACE-FOLDER>` replaced by the full path of that folder:

   ```json
   {
     "extraKnownMarketplaces": {
       "aegiscontext": { "source": { "source": "directory", "path": "<MARKETPLACE-FOLDER>" } }
     },
     "enabledPlugins": { "aegiscontext@aegiscontext": true },
     "prependPlugins": ["aegiscontext@aegiscontext", "sec-default@builtin"]
   }
   ```

   Keep `sec-default@builtin` in `prependPlugins`, after the plugin: a `prependPlugins` list replaces Claude Code's default seat for the guard, so leaving it out would remove the guard.
3. **The backup lock** (recommended): settings hooks with `onFailure: "block"`, so a hook that cannot start stops the call: [snippets/managed.json](snippets/managed.json). Node must be on the PATH. Copy `plugin/backup/` to a folder whose path contains `aegiscontext` and point `main.js` at it. Add `--policy <file>` only when your settings arrive by MDM or from the server, which a process cannot read; the file is a copy of that policy.
4. **AegisContext settings** under the `aegisContext` key of the same managed settings, with `locked` naming the settings users cannot change. Recommended: `"on_check_failure": "hold"` and `"locked": ["mode", "on_check_failure", "outbound"]`.

Put these in the managed settings location for the system:

| System | Managed settings file |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux, WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` |

or deliver them by MDM (Jamf, Intune) or from the Claude server. For an offline site the release archive is the whole thing. An internal git mirror of the repo does **not** reach the `prepend` tier; it serves the Personal install only.

## Put-back

`put_back` is off unless a developer turns it on ([personal.md](personal.md#put-secrets-back-optional-off-by-default)). Put-back lets Claude's file writes carry a real secret into a file that already holds it, and a save can erase a secret it cannot restore, so an organization may want it forbidden.

- `"put_back": "off"` under the `aegisContext` key binds with no `locked` list: nobody's own choice and no project's setting turns it on. `"locked": ["put_back"]` has the same effect.
- A managed `"put_back": "on"` does nothing and shows a notice. An organization can forbid put-back; it cannot switch it on for people.
- Without either, a project's `.claude/settings.json` can ask for it, and it then turns on for any developer who has made no choice of their own, with a notice that names the repo. That is the one exception to "a project can only make things stricter". Forbid it if you open repos you do not trust.
- The backup lock never restores, and observe mode restores nothing.

## Trial it

1. Run the leak test kit on one test machine ([verify.md](verify.md)): `npm run leak-test:org`.
2. Roll out with `"mode": "observe"` to a small group and read the log for false alarms. A permanent banner says nothing is hidden.
3. Tune with `allow` and `rules.off`.
4. Switch to `enforce`.

## Check a machine

Run `/redact doctor` on it. It should say Managed settings are present, show the plugin tier as `prepend`, and say the events reach the plugin. If `/redact` does not exist, the plugin did not load: check that `<MARKETPLACE-FOLDER>` is the folder that holds `.claude-plugin/`.

## Where the edges are

Safe mode turns the main lock off even here. The backup lock installed through managed settings keeps running in safe mode (`npm run leak-test:managed` proves it). The full list is [section 22 of the spec](engineering/spec.md).
