# Release checklist

For the maintainer. The tool never merges, tags or holds a signing key.

## Before a release candidate (`v0.1.0-rc.<n>`)

`v0.1.0-rc.1` and `v0.1.0-rc.2` (published 2026-11-03) went through this list. These are for `v0.1.0-rc.3`: Claude Code 2.1.317 tested and pinned (D-102), and the untested-version warning shown on the first 2 sessions per version (D-103). A later release candidate starts the list again.

If a macOS job is cancelled with "The job was not acquired by Runner of type hosted", GitHub had no macOS runner free. Use "Re-run failed jobs" on that run; nothing in the code failed.

- [x] PR #17 is green in CI on the three systems on the new pin, 2.1.317 (all 10 checks, 2026-11-04).
- [ ] PR #17 is merged into `develop`, and `develop` is green in CI after the merge.
- [ ] The weekly run (`.github/workflows/weekly.yml`) runs on its schedule from `release`. `schedule` and `workflow_dispatch` only work for the default branch, and GitHub switches a scheduled workflow off after 60 days with no repository activity: re-enable it from the Actions tab if it was.
- [x] The versions agree: `package.json`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/marker.ts` (all `0.1.0`), and `CHANGELOG.md` has a `0.1.0-rc.3` section.
- [x] `docs/tested-versions.md` and `docs/scores.md` are current for this release (`npm run measure` re-run 2026-11-04; only the two speed rows moved).
- [x] Private vulnerability reporting is on (`gh api repos/Mrinanka/aegiscontext/private-vulnerability-reporting` says `enabled`, checked 2026-11-04).
- [ ] The merge of `develop` into `release` (a PR; if its run cancels `develop`'s merge run, rerun the cancelled run once the PR run passes, see progress "Known issues").
- [ ] `npm run release:pack -- v0.1.0-rc.3` on a clean tree (see below).
- [ ] The tag is **signed** by the maintainer on the tip of `release` (the README install job refuses any other commit), and `git tag -v v0.1.0-rc.3` says `Good signature`. The release workflow runs CI and makes a **draft** release. It does not check the signature.
- [ ] The draft release is reviewed and published by the maintainer.

## Before `v0.1.0`

Not done by the tool; they need the maintainer, a real key, or a real app.

- [ ] **High priority:** the `v0.1.0` tag is signed the same way (D-094). `SHA256SUMS` sits in the same release as the archives, so it catches corruption, not tampering.
- [ ] Two weeks of daily use by the maintainer.
- [ ] Hand checks in the interactive terminal: `/resume` at `prompt.submit`, the `/redact add`, `learn` and `remove` panes, the `outbound: ask` dialog, the observe banner, whether `/redact` survives `/clear`.
- [ ] Hand checks for put-back, which a `-p` run cannot show: in the terminal, a Write or Edit with put-back on shows the permission dialog with the real value (and only you see it); a project whose `.claude/settings.json` sets `put_back` to `on` shows the notice naming the repo once, even with `notices: off`; `/redact put-back off --here` stops it for that folder.
- [x] Hand checks in **VS Code** (the extension's own Claude Code version) and the **desktop app's Code tab** (record its Claude Code version): done by the maintainer on 2.1.317 (D-102).
- [ ] The optional **real-API run**: the same doors against the real API, with a real key and network. It stays out of the kit.
- [ ] A trademark register search for "AegisContext" (USPTO, EUIPO). Only npm, GitHub and the web were searched.
- [ ] Reports to Anthropic for the items in spec section 22 ("Claude Code's own disk records") and the `claude plugin test` `HookStream.result` behaviour.
- [ ] The directory submission (the owner will do it; it needs an icon).

## Signing a tag

Run these in Git Bash, which has its own `gpg`. Replace the name, email and fingerprint with yours. The key is made once.

```
gpg --quick-generate-key "Your Name <your-github-email>" ed25519 sign 2y
gpg --list-secret-keys --keyid-format=long
gpg --armor --export <fingerprint>
git config --global user.signingkey <fingerprint>
```

Add the exported block at GitHub, Settings, "SSH and GPG keys". Check that `https://github.com/Mrinanka.gpg` then shows it, and put the fingerprint in `SECURITY.md`. Back the private key up somewhere safe: if it is lost, tags can't be signed with it again, and the new key's fingerprint has to be published.

Each release:

```
git switch release
git pull
git tag -s <tag> -m <tag>
git tag -v <tag>
git push origin <tag>
```

Never move or make a published tag again. `v0.1.0-rc.1` stays unsigned, and the next fix gets the next number.

## Cutting the archives

```
npm run release:pack -- <tag>
```

It refuses a dirty tree or a tag that does not match the version, makes the `.tar.gz` and `.zip` with `git archive`, and writes `SHA256SUMS`. Verify with `sha256sum -c SHA256SUMS` (macOS: `shasum -a 256 -c SHA256SUMS`; Windows: `Get-FileHash`).
