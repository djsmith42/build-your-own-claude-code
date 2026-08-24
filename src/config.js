// ─────────────────────────────────────────────────────────────────────────────
// UNIT 2 — AUTH & CONFIG
//
// The entire auth story: an API key in an environment variable.
//
// We start the process with `node --env-file=<repo>/.env` (see the ./mini-claude
// launcher), so Node loads .env into process.env before any of our code runs —
// no dotenv package, no parsing. The Anthropic SDK then reads
// ANTHROPIC_API_KEY on its own — `new Anthropic()` with no arguments is
// already authenticated. We only read the key here to fail with a friendly
// message instead of a stack trace.
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  // The directory the agent works in. The launcher already cd'd us here, so
  // there is nothing to resolve: every tool resolves paths against this, and
  // run_bash executes here.
  workspace: process.cwd(),
};

export function assertApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return;
  console.error("\nNo ANTHROPIC_API_KEY. Copy .env.example to .env and paste your key in.\n");
  process.exit(1);
}
