// The tested-versions list (spec §4, §20, R-01). The CLI's pinned version (2.1.317), the earlier pin 2.1.316,
// the VS Code extension's own copy of Claude Code (check 0.10), and the `stable` channel's 2.1.309 (the full kit, step 6).
// A version added here is run through the plugin tests and the whole kit on 3 systems by .github/workflows/versions.yml
// on its pull request, and checked in the VS Code extension and the desktop app by the maintainer before merging.
// Only `/redact doctor` reports a version not on the list; nothing is shown at session start (D-107).

export const TESTED_VERSIONS: readonly string[] = ['2.1.318', '2.1.317', '2.1.316', '2.1.315', '2.1.314', '2.1.312', '2.1.311', '2.1.310', '2.1.309']

export const isTested = (version: string): boolean => TESTED_VERSIONS.includes(version)
