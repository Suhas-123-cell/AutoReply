// Loads .env when run outside a container; a no-op where env vars are
// injected and .env is excluded by .dockerignore. Imported first by
// worker/dm-worker.ts so it runs before any module reads process.env.
// Uses Node's built-in loader (>= 20.12) rather than the dotenv package,
// which this project never declared as a dependency.
try {
  process.loadEnvFile();
} catch {
  // No .env file — environment comes from the host.
}
