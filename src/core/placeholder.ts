// What the model sees in place of a secret (spec §9):
//
//   [REDACTED:AWS_ACCESS_TOKEN ...7QXZ #k7q2m5x4p3abc]
//
// The tag is 13 base32 characters, which is 65 random bits (the spec asks for 64 or more).

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'
const TAG_CHARS = 13
const PREFIX = '[REDACTED:'
const MAX_LEN = 120

/** 65 random bits as 13 base32 characters. `random` is a secure source (crypto.getRandomValues). */
export function newTag(random: (bytes: number) => Uint8Array): string {
  const bytes = random(9)
  let bits = 0
  let acc = 0
  let out = ''
  for (let i = 0; i < bytes.length && out.length < TAG_CHARS; i++) {
    acc = (acc << 8) | (bytes[i] as number)
    bits += 8
    while (bits >= 5 && out.length < TAG_CHARS) {
      bits -= 5
      out += BASE32[(acc >> bits) & 31]
      acc &= (1 << bits) - 1
    }
  }
  return out
}

/** The last 4 characters, for values of 12 or more, when hints are on and the value allows one. */
export function hintOf(value: string, o: { on: boolean; allowed: boolean }): string | undefined {
  if (!o.on || !o.allowed || value.length < 12) return undefined
  const tail = value.slice(-4)
  return /^[A-Za-z0-9]{4}$/.test(tail) ? tail : undefined
}

export function cleanLabel(label: string): string {
  const cleaned = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '')
  return cleaned === '' ? 'SECRET' : cleaned
}

export function placeholderText(label: string, hint: string | undefined, tag: string): string {
  return `${PREFIX}${label}${hint === undefined ? '' : ` ...${hint}`} #${tag}]`
}

const SHAPE = /^\[REDACTED:[A-Z0-9_]{1,40}(?: \.\.\.[A-Za-z0-9]{4})? #[a-z2-7]{13}\]$/

/** Where the text already holds a placeholder, as [start, end) pairs. */
export function findPlaceholders(text: string): [number, number][] {
  const out: [number, number][] = []
  let from = 0
  for (;;) {
    const start = text.indexOf(PREFIX, from)
    if (start < 0) return out
    // Only as far as a placeholder can reach, so a flood of starts costs linear time.
    let close = -1
    const limit = Math.min(text.length, start + MAX_LEN)
    for (let i = start + PREFIX.length; i < limit; i++) {
      const c = text.charCodeAt(i)
      if (c === 0x5d) close = i
      if (c === 0x5d || c === 0x5b) break
    }
    if (close >= 0 && SHAPE.test(text.slice(start, close + 1))) {
      out.push([start, close + 1])
      from = close + 1
    } else {
      from = start + PREFIX.length
    }
  }
}
