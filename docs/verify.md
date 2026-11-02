# Verify it yourself

The maintainers cannot test inside every organization, so everything needed to test ships with the tool. None of it needs an API key or the network.

## In a session

| Command | What it shows |
|---|---|
| `/redact self-check` | Built-in cases run in seconds and show pass or fail. `--report` saves a result you can share; it holds no secrets. |
| `/redact doctor` | The environment: Claude Code version (tested or not), Personal or Managed, the plugin's tier, the built-in guard, the password store, the backup lock, Node, the marker and the settings. |

## The leak test kit

A small local server pretends to be the model API. It plays a scripted conversation that makes Claude Code read files, run commands, use `@` files, compact and run subagents, all holding planted **fake** secrets. Claude Code is pointed at it with `ANTHROPIC_BASE_URL`. The server records every request Claude Code sends and searches the recording for the fakes. Any hit is a failure. A recording proxy refuses and logs every network attempt, and any attempt makes the run invalid. The kit uses Node built-ins only.

Each door has a witness, a harmless token planted beside the fakes. A door whose witness never arrived proves nothing, so it is reported **invalid**, never clean.

### Run it

You need the repository, Node 24 (`.nvmrc`), and the pinned Claude Code (about 320 MB, its own lockfile):

```
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix tools/leak-test/claude-pin
```

Then:

| Command | What it proves |
|---|---|
| `npm run leak-test:baseline -- --require-pinned` | The kit can see: with an empty plugin, every planted fake must be seen. If any is not, the kit is blind and nothing else means anything. |
| `npm run leak-test` | With the plugin in `plugin/`, no fake may be seen at any door. `-- --only <scenario>` runs one. |
| `npm run leak-test:backup` | The backup lock alone (settings hooks, plugin not loaded) hides the doors it covers. |
| `npm run leak-test:backup-limits` | The doors the backup lock does **not** cover leak, as the docs say. The list of limits is proven, not claimed. |
| `npm run leak-test:guarded-login` | A made-up Team login in the run's own folder seats Claude Code's built-in guard, with no account and no managed file. The doors the guard passes over must leak, and every other door must stay clean. Claude Code also tries `api.anthropic.com` here; the kit's proxy refuses it and the report marks it "expected, refused". |
| `npm run leak-test:guarded-login-hold` | The same with `on_check_failure: hold`: those doors must be refused, with no request sent. |

Exit codes: 0 pass, 1 a fake was seen (or a baseline was blind), 2 the run was invalid or badly called.

The runs below write the **machine's managed settings file** while they run, so they refuse to start without `--allow-managed-file` (the npm scripts pass it). They run in CI. Run them by hand only on a test machine, and note that on Windows you need an administrator and on macOS and Linux `sudo -n` must work. The kit never overwrites a managed file that is already there and removes its own when done.

| Command | What it proves |
|---|---|
| `npm run leak-test:managed` | The backup lock installed through managed settings still runs in safe mode. |
| `npm run leak-test:org` | The organization install (a folder marketplace, `prependPlugins`) leaves no door open. Each run's debug log must show the plugin in tier `prepend`; a log without that makes the run invalid. |
| `npm run leak-test:guarded-hold` | The same machine with `on_check_failure: hold`: the doors that leak above must be refused, with no request sent. It writes the machine's managed settings file, so it runs in CI. |
| `npm run leak-test:org-observe` | The organization install with `mode: observe`: every fake must be seen, because observe hides nothing, and the plugin's log must say it would have hidden them. |
| `npm run leak-test:guarded` | The plugin as a user plugin on a machine with managed settings: the doors Claude Code's built-in guard passes over must leak, and every other door must stay clean. |

### What the kit does not prove

- It tests the pinned Claude Code (see [tested-versions.md](tested-versions.md)), against a pretend model. It does not call the real API.
- No network traffic is **proven** only on Linux, where a no-network run is part of CI. On Windows and macOS the proxy trap sees only traffic that honours proxy settings.
- The login runs use a made-up login. They prove that a Team or Enterprise plan seats the built-in guard and what happens then, not how a real account behaves.
- The VS Code extension and the desktop app run their own copy of Claude Code; they were checked by hand once per release ([release-checklist.md](release-checklist.md)), not by the kit.

## Check a release

Release tags from `v0.1.0-rc.2` on are signed with the maintainer's GPG key. `v0.1.0-rc.1` is not signed. `SHA256SUMS` sits in the same release as the archives, so it catches a damaged download but not a tampered release. The signature is what shows the tag came from the maintainer.

Take the key from the maintainer's GitHub profile, not from the archive you are checking:

```
curl -s https://github.com/Mrinanka.gpg | gpg --import
git clone https://github.com/Mrinanka/aegiscontext.git
cd aegiscontext
git tag -v <tag>
```

Look for `Good signature`, and compare the key's fingerprint with the one in [SECURITY.md](../SECURITY.md). A warning that the key is "not certified with a trusted signature" only means you have not told gpg to trust it yet. `BAD signature`, or `No public key` after the import, means stop.

The signature covers the tag, not the archives, so tie the two together. Rebuild the `.tar.gz` from the tag you just checked:

```
git archive --format=tar.gz --prefix=aegiscontext-<tag>/ -o mine.tar.gz <tag>
sha256sum mine.tar.gz
```

The hash must equal the `.tar.gz` line in the release's `SHA256SUMS`. Use the `.tar.gz`: the `.zip` rebuilt with a different hash. For `v0.1.0-rc.1`, a rebuild on Windows matched the file made on Linux in CI.

## A trial in your organization

1. Run `npm run leak-test:org` on one managed test machine, and `npm run leak-test:org-observe` if you will start in `observe` mode.
2. Roll out in `observe` mode to a small group and review the log for false alarms.
3. Tune with `allow` and `rules.off`.
4. Switch to `enforce`.

## Numbers

Catch rate, false-alarm rate and speed for this release: [scores.md](scores.md).
