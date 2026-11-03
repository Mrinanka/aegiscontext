# Contributing

Thank you for helping keep secrets out of model context. The rules are short.

## Ground rules

- **Tests first.** Write the test, see it fail, then write the code. Never change or delete a test to make it pass; if a test seems wrong, say so in the pull request.
- **TypeScript only, no runtime libraries.** Everything that runs is in this repo. Build and test tools are dev dependencies, pinned by `package-lock.json`; ask before adding one.
- **No network and no plaintext secrets.** The tool never contacts the network and never writes a secret to disk unencrypted (logs, reports and temp files included).
- **Fake secrets only.** Never use a real secret, anywhere. Build fake keys at test time by joining pieces (`"ghp_" + "abc..."`), so GitHub secret scanning doesn't flag the repo. Docs and logs never hold a secret, not even a fake one written whole.
- **Cross-platform.** macOS, Windows and Linux. Scripts are Node, not bash. Build paths with `path.join`.
- **Credit copied code** in `THIRD_PARTY_LICENSES` before it is merged.

## Sign off your commits (DCO)

Every commit carries a sign-off, which says you may submit the work under the Apache-2.0 licence (<https://developercertificate.org>):

```
git commit -s
```

## Setting up

```
npm ci --ignore-scripts
npm test
npm run typecheck
```

Node 24 (see `.nvmrc`). The leak test kit needs the pinned Claude Code: `npm ci --ignore-scripts --prefix tools/leak-test/claude-pin`. `docs/verify.md` explains the kit.

If you change anything under `src/`, run `npm run plugin:build`; the plugin carries a copy of it, and CI checks that the copy is current.

## Branches and pull requests

Branch from `develop` and open the pull request into `develop`. `release` is merged from `develop` by the maintainer for each release. Say in the pull request which tests you added and which spec section (`R-` number or `D-` decision) it serves.

## Reporting a security problem

Not here: see `SECURITY.md`.
