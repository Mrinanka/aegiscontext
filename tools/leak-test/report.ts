// Plain-text summary of a kit report. Labels and counts only.

import { unexpectedAttempts, type DoorResult, type Report, type Verdict } from './kit.ts'

const WORD: Record<Verdict, string> = { pass: 'PASS', leak: 'LEAK', blind: 'BLIND', invalid: 'INVALID' }

function doorLine(d: DoorResult): string {
  const seen = d.fakes.filter(f => f.leaked)
  const parts = [...new Set(seen.flatMap(f => f.parts))].sort().join(',')
  const missed = d.fakes.filter(f => !f.leaked).map(f => f.kind).join(',')
  const details = [
    `${seen.length}/${d.fakes.length} fakes seen`,
    parts === '' ? '' : `in ${parts}`,
    d.witnessSeen ? '' : 'no witness',
    seen.length > 0 && missed !== '' ? `missed ${missed}` : '',
  ].filter(s => s !== '')
  return `${WORD[d.verdict].padEnd(8)}${`${d.scenario}/${d.door}`.padEnd(30)}${details.join(', ')}`
}

export function formatReport(r: Report): string {
  const fakes = r.doors.flatMap(d => d.fakes)
  const seconds = Math.round(r.runs.reduce((sum, x) => sum + x.seconds, 0))
  const lines = [
    `leak test: Claude Code ${r.claudeVersion}${r.pinnedVersion && r.pinnedVersion !== r.claudeVersion ? ` (pinned: ${r.pinnedVersion})` : ''}, ${r.os}, plugin ${r.plugin}, expecting ${r.expect === 'leaks' ? 'every fake to be seen (baseline)' : 'no fake to be seen'}`,
    '',
    ...r.doors.map(doorLine),
    '',
  ]
  for (const run of r.runs.filter(x => x.timedOut || x.exit !== 0)) {
    lines.push(`run failed: ${run.scenario} #${run.run}, exit ${run.exit}${run.timedOut ? ', timed out' : ''}`)
    for (const l of run.stderr ?? []) lines.push(`  ${l}`)
  }
  const unexpected = unexpectedAttempts(r.network.attempts, r.network.expected)
  for (const a of r.network.attempts) lines.push(`network attempt: ${a.kind} ${a.host}${unexpected.includes(a) ? '' : ' (expected, refused)'}`)
  if (r.unreadable > 0) lines.push(`requests that could not be read: ${r.unreadable}`)
  if (r.leftovers > 0) lines.push(`scratch folders not removed: ${r.leftovers}`)
  if (r.disk.length > 0) {
    lines.push('on disk (reported, not failed):')
    for (const d of r.disk) lines.push(`  ${d.where}: ${d.fakes} fakes`)
  }
  lines.push(`${WORD[r.verdict]}: ${fakes.filter(f => f.leaked).length} of ${fakes.length} fakes seen, ${r.doors.length} doors, ${r.network.attempts.length} network attempts, ${seconds} s`)
  return lines.join('\n')
}
