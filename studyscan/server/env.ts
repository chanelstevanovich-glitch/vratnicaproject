// Load variables from a local .env file (if present) before anything reads process.env.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // No .env file - rely on the shell environment.
}
