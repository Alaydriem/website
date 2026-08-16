/**
 * Reads a required environment variable.
 *
 * Takes the environment as an argument rather than reading process.env so the
 * behaviour is testable without mutating global state.
 */
export function requireEnv(name, env) {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
