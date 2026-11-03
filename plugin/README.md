# AegisContext

Keep API keys, passwords and tokens out of Claude's context. Every message you type, every file Claude reads, every command output and every piece of project context is checked, and each secret is replaced by a placeholder such as `[REDACTED:AWS_KEY ...0001 #k7q2m5x4p3abc]`. Claude keeps working: it knows a secret is there, but never sees the value.

No network, no runtime libraries, and it never writes a secret to disk unencrypted (the one optional exception, `put_back`, is off by default). Settings go under an `aegisContext` key in Claude Code's settings files. Built to stop accidents; not a guarantee. The limits, and how to prove it yourself: the repository's `README.md` and `docs/engineering/spec.md`.

## Install

```
/plugin install aegiscontext --marketplace Mrinanka/aegiscontext
```

Then run `/redact doctor`. Administrators: see `docs/managed.md` in the repository.
