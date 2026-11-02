# Security policy

AegisContext hides secrets before a model sees them, so a report that it misses one, or leaks one itself, is a security report.

## Reporting a problem

Report it **privately**, never in a public issue:

1. Open <https://github.com/Mrinanka/aegiscontext/security/advisories/new> (GitHub private vulnerability reporting).
2. Describe what you did and what reached the model or the disk. Use a **fake** secret built for the test. Never paste a real one, in a report or anywhere else.
3. Add the output of `/redact doctor` and, if you can, the file from `/redact self-check --report` (it holds no secrets).

This is a community project with no support contract. Reports are read on a best-effort basis, with no promised reply time.

## What counts

- A secret that reaches the model through a door the docs say is covered (`docs/spec.md` sections 6 and 22 list the doors and the known limits).
- A secret written to disk unencrypted by the tool (logs, reports, temp files).
- Any network traffic from the tool. It never contacts the network.
- A way for a prompt, file or web page to make Claude turn the tool off (spec section 17).

## What does not

The limits in `docs/spec.md` section 22 are known and documented, for example a secret with no known shape, content sent before the tool was installed, and Claude Code's own disk records. They are not vulnerabilities, but a better way to close one is welcome as an ordinary issue.

## Release signing

Release tags from `v0.1.0-rc.2` on are signed with the maintainer's GPG key; `v0.1.0-rc.1` is not signed. How to check one: [docs/verify.md](docs/verify.md#check-a-release).

The key's fingerprint is added here before `v0.1.0-rc.2` is tagged.

## Supported versions

Only the latest release. Fixes land on `develop` and ship in the next release.
