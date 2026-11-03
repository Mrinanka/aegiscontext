// Guards for the repo ground rules (plan.md "Ground rules", spec §4 and §21, CLAUDE.md "Rules").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readText(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

function readJson(...parts: string[]): Record<string, unknown> {
  return JSON.parse(readText(...parts)) as Record<string, unknown>;
}

/** An exact semver like 1.2.3 or 1.2.3-rc.1: no ranges, tags, or wildcards. */
export function isExactVersion(spec: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(spec);
}

/** Every `uses:` reference in a workflow that is not pinned to a full 40-hex commit SHA. */
export function unpinnedActions(workflowYaml: string): string[] {
  const bad: string[] = [];
  for (const line of workflowYaml.split(/\r?\n/)) {
    const m = /^\s*(?:-\s*)?uses:\s*['"]?([^\s'"#]+)/.exec(line);
    if (m === null) continue;
    const ref = m[1]!;
    if (ref.startsWith('./')) continue; // local action in this repo
    if (!/@[0-9a-f]{40}$/.test(ref)) bad.push(ref);
  }
  return bad;
}

function workflowFiles(): string[] {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

describe('helpers', () => {
  test('isExactVersion accepts exact versions and rejects ranges', () => {
    assert.equal(isExactVersion('7.0.2'), true);
    assert.equal(isExactVersion('1.0.0-rc.1'), true);
    for (const r of ['^7.0.2', '~7.0.2', '*', '7.x', '>=7', 'latest', '7.0']) {
      assert.equal(isExactVersion(r), false, r);
    }
  });

  test('unpinnedActions rejects tags and short SHAs, accepts 40-hex SHAs', () => {
    const yaml = [
      'steps:',
      '  - uses: actions/checkout@v4',
      '  - uses: actions/setup-node@949feb2',
      '  - uses: actions/cache@' + 'a'.repeat(40) + ' # v4.0.0',
      "    uses: 'org/x@main'",
      '  - uses: ./local-action',
    ].join('\n');
    assert.deepEqual(unpinnedActions(yaml), [
      'actions/checkout@v4',
      'actions/setup-node@949feb2',
      'org/x@main',
    ]);
  });
});

describe('package.json', () => {
  test('has no runtime dependencies', () => {
    const pkg = readJson('package.json');
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies']) {
      const deps = pkg[field] as Record<string, string> | string[] | undefined;
      const count = deps === undefined ? 0 : Array.isArray(deps) ? deps.length : Object.keys(deps).length;
      assert.equal(count, 0, `package.json "${field}" must be empty: no runtime libraries`);
    }
  });

  test('every devDependency is an exact version', () => {
    const dev = (readJson('package.json').devDependencies ?? {}) as Record<string, string>;
    assert.ok(Object.keys(dev).length > 0, 'expected dev dependencies (typescript, @types/node)');
    for (const [name, spec] of Object.entries(dev)) {
      assert.ok(isExactVersion(spec), `${name}@${spec} is not pinned to an exact version`);
    }
  });

  test('package-lock.json exists and matches the pinned devDependencies', () => {
    const dev = (readJson('package.json').devDependencies ?? {}) as Record<string, string>;
    const lock = readJson('package-lock.json');
    const packages = lock.packages as Record<string, { version?: string; devDependencies?: Record<string, string> }>;
    assert.deepEqual(packages['']?.devDependencies, dev, 'lockfile root devDependencies differ from package.json');
    for (const [name, spec] of Object.entries(dev)) {
      assert.equal(packages[`node_modules/${name}`]?.version, spec, `lockfile resolves ${name} to a different version`);
    }
  });
});

describe('licensing (spec §21, D-001)', () => {
  test('LICENSE is the Apache License 2.0', () => {
    const text = readText('LICENSE');
    assert.match(text, /Apache License/);
    assert.match(text, /Version 2\.0, January 2004/);
  });

  test('NOTICE exists with a copyright line', () => {
    assert.match(readText('NOTICE'), /^Copyright \d{4} \S.*$/m);
  });
});

describe('layout (part 0.0)', () => {
  test('required folders exist', () => {
    for (const parts of [['plugin'], ['src', 'checker'], ['tools', 'leak-test'], ['tests'], ['experiments']]) {
      const p = join(root, ...parts);
      assert.ok(existsSync(p) && statSync(p).isDirectory(), `missing folder ${join(...parts)}`);
    }
  });

  test('.gitignore ignores node_modules', () => {
    assert.match(readText('.gitignore'), /^\/?node_modules\/?$/m);
  });

  // Git for Windows sets core.autocrlf=true system-wide, so without this a Windows
  // clone gets CRLF and regex anchors, offsets and fixture sizes differ by OS.
  test('.gitattributes forces LF for text files on every OS', () => {
    assert.match(readText('.gitattributes'), /^\*\s+text=auto\s+eol=lf\s*$/m);
  });
});

describe('CI (plan.md Ground rules, spec §4)', () => {
  test('at least one workflow exists', () => {
    assert.ok(workflowFiles().length > 0, 'no workflow in .github/workflows');
  });

  test('every action is pinned to a 40-hex commit SHA', () => {
    for (const f of workflowFiles()) {
      assert.deepEqual(unpinnedActions(readText('.github', 'workflows', f)), [], `${f} has unpinned actions`);
    }
  });

  test('the CI matrix covers Linux, Windows and macOS', () => {
    const all = workflowFiles().map((f) => readText('.github', 'workflows', f)).join('\n');
    for (const os of ['ubuntu-', 'windows-', 'macos-']) {
      assert.ok(all.includes(os), `CI does not run on ${os}*`);
    }
  });

  test('every workflow has a job timeout and cancels superseded runs', () => {
    for (const f of workflowFiles()) {
      const yaml = readText('.github', 'workflows', f);
      assert.match(yaml, /^\s+timeout-minutes:\s*\d+\s*$/m, `${f} has no timeout-minutes`);
      assert.match(yaml, /^concurrency:/m, `${f} has no concurrency group`);
      assert.match(yaml, /^\s+cancel-in-progress:\s*true\s*$/m, `${f} does not cancel superseded runs`);
    }
  });

  test('CI runs on a pull request into develop or release, and on a push (a merge) to them, not on every branch push', () => {
    const yaml = readText('.github', 'workflows', 'ci.yml');
    const on = /^on:\n((?:[ \t]+.*\n|\n)*)/m.exec(yaml)?.[1] ?? '';
    const branchesOf = (event: string): string[] => {
      const m = new RegExp(`^  ${event}:\\n    branches: \\[([^\\]]*)\\]`, 'm').exec(on);
      return m ? (m[1] as string).split(',').map((b) => b.trim().replace(/^['"]|['"]$/g, '')).sort() : [];
    };
    assert.deepEqual(branchesOf('push'), ['develop', 'release'], 'push runs only for develop and release');
    assert.deepEqual(branchesOf('pull_request'), ['develop', 'release'], 'a pull request runs only into develop or release');
    assert.match(on, /^  workflow_call:/m, 'the release workflow still calls CI');
  });

  test('a push and its pull request share one CI run; a fork with the same branch name does not', () => {
    const group = /^\s+group:\s*(.+)$/m.exec(readText('.github', 'workflows', 'ci.yml'))?.[1] ?? '';
    assert.ok(group.includes('github.head_ref || github.ref_name'), 'a PR and a push must name the branch the same way');
    assert.ok(group.includes('github.event.pull_request.head.repo.full_name || github.repository'), 'a fork must not share a group with this repo');
    assert.ok(!group.includes('pull_request.number'), 'a PR number never matches a push, so nothing is cancelled');
  });
});
