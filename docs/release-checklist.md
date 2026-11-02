# Release checklist

For the maintainer. The tool never merges, tags or holds a signing key.

## Before a release candidate (`v0.1.0-rc.<n>`)

`v0.1.0-rc.1` went through this list. These are for `v0.1.0-rc.2`.

- [ ] `develop` is green in CI on the three systems, including `leak-test:org`, `leak-test:org-observe`, `leak-test:guarded`, `leak-test:guarded-hold` and `leak-test:guarded-login`.
- [ ] `docs/spec.md` section 22 lists the doors `leak-test:guarded` measured (`GUARDED_OPEN` in `tools/leak-test/org.ts`).
- [ ] The versions agree: `package.json`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/marker.ts`, `CHANGELOG.md`.
- [ ] `docs/tested-versions.md` and `docs/scores.md` are current for this release.
- [ ] Private vulnerability reporting is on (`gh api repos/Mrinanka/aegiscontext/private-vulnerability-reporting` says `enabled`): `SECURITY.md`, `CODE_OF_CONDUCT.md` and the issue template link to it.
- [ ] `npm run release:pack` on a clean tree (see below).
- [ ] The merge of `develop` into `release`; `release` is the repository's default branch.
- [ ] A GPG signing key exists, its public key is on the GitHub profile, and its fingerprint is in `SECURITY.md` ("Signing a tag", below). The fingerprint change goes in before the tag.
- [ ] The tag is **signed** by the maintainer on the tip of `release` (the README install job refuses any other commit), and `git tag -v <tag>` says `Good signature`. The release workflow runs CI and makes a **draft** release. It does not check the signature.

## Before `v0.1.0`

Not done by the tool; they need the maintainer, a real key, or a real app.

- [ ] **High priority:** the `v0.1.0` tag is signed the same way (D-094). `SHA256SUMS` sits in the same release as the archives, so it catches corruption, not tampering.
- [ ] Two weeks of daily use by the maintainer.
- [ ] Hand checks in the interactive terminal: `/resume` at `prompt.submit`, the `/redact add`, `learn` and `remove` panes, the `outbound: ask` dialog, the observe banner, whether `/redact` survives `/clear`.
- [ ] Hand checks in **VS Code** (the extension's own Claude Code version) and the **desktop app's Code tab** (record its Claude Code version). The probe log of the desktop app had no start line, so its version was never recorded.
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
