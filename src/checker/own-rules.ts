// AegisContext's own rules for popular keys that Gitleaks (v8.30.1) has no rule for (D-105).
// Plain data in Gitleaks' shape, read at build time by `npm run rules:build`, which converts
// them with the same code as the Gitleaks rules and writes own-rules.generated.ts.
//
// Shape: `\b(<key>)` followed by a quote, a space, `;`, an escaped newline or the end. Case
// sensitive, with a minimum length and no tight maximum, so a format we got slightly wrong
// still matches while an ordinary word does not. The entropy floor skips placeholders such as
// a long run of one letter. The four short prefixes (sk-, sk_, fw_, re_) are guarded by shape.
//
// Not covered, because there is no prefix to match: Mistral, Azure, and older Together and
// Figma keys. Those stay label-only (spec section 7.3).

import type { RawRule } from './types.ts'

const END = String.raw`(?:[\x60'"\s;]|\\[nr]|$)`
const rule = (id: string, description: string, key: string, entropy = 3): RawRule => ({
  id,
  description,
  regex: String.raw`\b(${key})${END}`,
  entropy,
})

export const OWN_RAW: RawRule[] = [
  rule('openrouter-api-key', 'Found an OpenRouter API key, which could let someone spend the owner\'s credit on any model.', String.raw`sk-or-v1-[a-f0-9]{64}`),
  rule('groq-api-key', 'Found a Groq API key, which could let someone use the owner\'s Groq account.', String.raw`gsk_[A-Za-z0-9]{20,100}`),
  rule('xai-api-key', 'Found an xAI API key, which could let someone use the owner\'s xAI account.', String.raw`xai-[A-Za-z0-9]{20,120}`),
  rule('deepseek-api-key', 'Found a DeepSeek API key, which could let someone use the owner\'s DeepSeek account.', String.raw`sk-[a-f0-9]{32}`),
  rule('replicate-api-token', 'Found a Replicate API token, which could let someone run models on the owner\'s account.', String.raw`r8_[A-Za-z0-9]{37}`),
  rule('fireworks-api-key', 'Found a Fireworks AI API key, which could let someone use the owner\'s Fireworks account.', String.raw`fw_[A-Za-z0-9]{20,100}`, 4),
  rule('together-api-key', 'Found a Together AI API key, which could let someone use the owner\'s Together account.', String.raw`tgp_v1_[A-Za-z0-9_-]{30,100}`),
  rule('cerebras-api-key', 'Found a Cerebras API key, which could let someone use the owner\'s Cerebras account.', String.raw`csk-[A-Za-z0-9]{32,100}`),
  rule('elevenlabs-api-key', 'Found an ElevenLabs API key, which could let someone use the owner\'s ElevenLabs account.', String.raw`sk_[a-f0-9]{48}`),
  rule('langsmith-api-key', 'Found a LangSmith API key, which could expose the owner\'s traces and datasets.', String.raw`lsv2_(?:pt|sk)_[A-Za-z0-9_]{32,100}`),
  rule('langfuse-secret-key', 'Found a Langfuse secret key, which could expose the owner\'s traces and prompts.', String.raw`sk-lf-[A-Za-z0-9-]{20,100}`),
  rule('pinecone-api-key', 'Found a Pinecone API key, which could expose or change the owner\'s vector indexes.', String.raw`(?:pcsk|pckey)_[A-Za-z0-9]{4,20}_[A-Za-z0-9]{40,100}`),
  rule('tavily-api-key', 'Found a Tavily API key, which could let someone use the owner\'s Tavily account.', String.raw`tvly-(?:dev-|prod-)?[A-Za-z0-9]{24,64}`),
  rule('supabase-access-token', 'Found a Supabase access token, which could manage the owner\'s Supabase projects.', String.raw`sbp_[A-Za-z0-9]{32,100}`),
  rule('supabase-secret-key', 'Found a Supabase secret key, which bypasses row-level security on the owner\'s database.', String.raw`sb_secret_[A-Za-z0-9_-]{20,100}`),
  rule('vercel-access-token', 'Found a Vercel access token, which could manage the owner\'s Vercel projects.', String.raw`vcp_[A-Za-z0-9]{24,100}`),
  rule('docker-hub-pat', 'Found a Docker Hub personal access token, which could push and pull the owner\'s images.', String.raw`dckr_pat_[A-Za-z0-9_-]{20,100}`),
  rule('google-oauth-client-secret', 'Found a Google OAuth client secret, which could let someone act as the owner\'s app.', String.raw`GOCSPX-[A-Za-z0-9_-]{24,40}`),
  rule('stripe-webhook-secret', 'Found a Stripe webhook signing secret, which could let someone forge webhook calls.', String.raw`whsec_[A-Za-z0-9+/=]{32,100}`),
  rule('resend-api-key', 'Found a Resend API key, which could let someone send email as the owner.', String.raw`re_[A-Za-z0-9]{8}_[A-Za-z0-9]{24}`, 3.5),
  rule('neon-api-key', 'Found a Neon API key, which could manage the owner\'s Neon databases.', String.raw`napi_[A-Za-z0-9]{40,100}`),
  rule('render-api-key', 'Found a Render API key, which could manage the owner\'s Render services.', String.raw`rnd_[A-Za-z0-9]{24,100}`),
  rule('tailscale-key', 'Found a Tailscale key, which could join a device to the owner\'s network or manage it.', String.raw`tskey-(?:auth|api|client|scim|webhook)-[A-Za-z0-9]{8,64}-[A-Za-z0-9]{16,100}`),
  rule('figma-pat', 'Found a Figma personal access token, which could read the owner\'s Figma files.', String.raw`figd_[A-Za-z0-9_-]{30,100}`),

  // A second batch, with distinct long prefixes. Classes are kept wide on purpose: the formats
  // are from third-party pages or memory, and a wrong guess should still match, not miss.
  rule('exa-api-key', 'Found an Exa API key, which could let someone run searches on the owner\'s account.', String.raw`exa_[A-Za-z0-9_-]{32,100}`),
  rule('cartesia-api-key', 'Found a Cartesia API key, which could let someone generate audio on the owner\'s account.', String.raw`sk_car_[A-Za-z0-9]{20,100}`),
  rule('e2b-api-key', 'Found an E2B API key, which could let someone start cloud sandboxes on the owner\'s account.', String.raw`e2b_[A-Za-z0-9]{40,100}`),
  rule('runpod-api-key', 'Found a RunPod API key, which could let someone rent GPUs on the owner\'s account.', String.raw`rpa_[A-Za-z0-9]{32,100}`),
  rule('apify-api-token', 'Found an Apify API token, which could let someone run actors and scrapers on the owner\'s account.', String.raw`apify_api_[A-Za-z0-9]{32,100}`),
  rule('browserbase-api-key', 'Found a Browserbase API key, which could let someone run headless browser sessions on the owner\'s account.', String.raw`bb_live_[A-Za-z0-9_-]{24,100}`),
  rule('trigger-dev-secret-key', 'Found a Trigger.dev secret key, which could trigger or inspect the owner\'s background jobs.', String.raw`tr_(?:dev|prod|stg)_[A-Za-z0-9]{20,100}`),
  rule('inngest-signing-key', 'Found an Inngest signing key, which could let someone forge or inspect the owner\'s background events.', String.raw`signkey-(?:prod|test)-[A-Za-z0-9]{40,128}`),
  rule('unkey-root-key', 'Found an Unkey root key, which could let someone mint or revoke the owner\'s API keys.', String.raw`unkey_[A-Za-z0-9]{20,100}`),
  rule('expo-access-token', 'Found an Expo access token, which could publish updates to the owner\'s mobile app.', String.raw`exp_[A-Za-z0-9]{32,100}`),
  rule('posthog-personal-api-key', 'Found a PostHog personal API key, which gives access to the owner\'s analytics data.', String.raw`phx_[A-Za-z0-9]{36,100}`),
  rule('axiom-api-token', 'Found an Axiom API token, which could read or add logs in the owner\'s datasets.', String.raw`xaat-[A-Za-z0-9-]{30,100}`),
  rule('polar-access-token', 'Found a Polar access token, which could manage the owner\'s subscriptions, webhooks and payouts.', String.raw`polar_(?:oat|pat|at)_[A-Za-z0-9]{32,100}`),
  rule('mem0-api-key', 'Found a Mem0 API key, which could expose or change the owner\'s agent memory store.', String.raw`m0-[A-Za-z0-9_-]{32,100}`),
  rule('statsig-secret-key', 'Found a Statsig server secret key, which could change the owner\'s feature flags and experiments.', String.raw`secret-[A-Za-z0-9]{32,100}`),
  rule('loops-api-key', 'Found a Loops API key, which could send email or export the owner\'s mailing list.', String.raw`loops_[A-Za-z0-9]{32,100}`),
]
