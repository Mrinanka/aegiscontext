// A made-up Team or Enterprise login for the kit's guarded run (step 7, D-092). Claude Code reads the plan from the
// stored login, and a Team or Enterprise plan seats its built-in guard, so a run can reach that path with no account
// and no managed settings file. The token is not a token: it goes in the run's own config folder, and the only place
// it is sent is the mock.

export type LoginPlan = 'team' | 'enterprise'

export const LOGIN_PLANS: readonly string[] = ['team', 'enterprise']

/**
 * With a login Claude Code tries its own API host as well as the mock. The kit's proxy refuses the CONNECT, so nothing
 * is sent, and only this host, only as a CONNECT, is let off the rule that any attempt makes a run invalid.
 */
export const LOGIN_HOSTS: string[] = ['api.anthropic.com:443']

const DAY_MS = 86_400_000

export function fakeCredentials(plan: LoginPlan, now: number) {
  return {
    claudeAiOauth: {
      accessToken: 'not-a-real-token',
      refreshToken: 'not-a-real-token',
      expiresAt: now + DAY_MS,
      scopes: ['user:inference', 'user:profile'],
      subscriptionType: plan,
    },
  }
}
