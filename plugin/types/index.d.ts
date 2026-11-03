// The plugin's $.state contract. These values live in the host's memory for the session, so a
// restarted hooks worker keeps the session's catches and tags (spec §7 check 4, §9). Nothing here is
// ever written to disk by this plugin.

export type ShieldCatch = {
  value: string
  tag: string
  label: string
  ruleId: string
  showHint: boolean
  caught: boolean
  action?: 'hide' | 'block' | 'warn'
}

/** The resume scan's answer for one session id (R-06). */
export type ShieldResume = { session: string; found: number; lifted: boolean }
/** One write `/redact allow` let past the overwrite guard (R-11). */
export type ShieldGuardPass = { file: string }
/** A placeholder Claude wrote into a file (spec §10). The file name is already redacted. */
export type ShieldPlaced = { file: string; line: number; tag: string }
/** One line of `/redact`: what kind of value, where, and its hint. `where` is already redacted. */
export type ShieldHidden = { label: string; where: string; tag: string; hint?: string }
/** What `/redact add` and `learn` show. Never a value. */
export type ShieldPaneNote = { text: string; isError: boolean }
export type ShieldLearnRow = { id: string; file: string; key: string; length: number; ticked: boolean }
/** One saved value in `/redact remove`. Never the value. */
export type ShieldRemoveRow = { id: string; label: string; added: string; length: number; ticked: boolean }

declare module 'claude-code' {
  interface PluginState {
    'aegiscontext': {
      catches: ShieldCatch[]
      resume: ShieldResume
      allowed: string[]
      guardPass: ShieldGuardPass | null
      placed: ShieldPlaced[]
      hidden: ShieldHidden[]
      addNote: ShieldPaneNote | null
      learnRows: ShieldLearnRow[]
      learnNote: ShieldPaneNote | null
      removeRows: ShieldRemoveRow[]
      removeNote: ShieldPaneNote | null
      /** prompt.compose has run in this session: the events reach the plugin (spec §5.3). */
      composeSeen: boolean
      /** The built-in guard warning has been shown this session. */
      guardWarned: boolean
      /** The notice that a project turned put-back on has been shown this session (spec §10). */
      putBackNoticed: boolean
      /** Whether this session's instructions carry the put-back note, fixed at the first compose so the thread's prompt cache holds. */
      putBackNote: boolean
    }
  }
}
