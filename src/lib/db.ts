import "server-only";

type Row = Record<string, unknown>;
type Runner = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  building TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  x_handle TEXT NOT NULL DEFAULT '',
  farcaster TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  catchable BOOLEAN NOT NULL DEFAULT TRUE,
  face DOUBLE PRECISION[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catches (
  catcher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caught_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (catcher_id, caught_id)
);
CREATE INDEX IF NOT EXISTS catches_caught_idx ON catches(caught_id);
ALTER TABLE catches DROP COLUMN IF EXISTS photo;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS links TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token TEXT;
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  catcher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL
);
`;

declare global {
  var __pokedevRunner: Promise<Runner> | undefined;
}

async function createRunner(): Promise<Runner> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let run: Runner;
  let exec: (text: string) => Promise<void>;

  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    run = async (text, params = []) => (await sql.query(text, params)) as Row[];
    exec = async (text) => {
      for (const stmt of text.split(";").map((s) => s.trim()).filter(Boolean)) {
        await sql.query(stmt);
      }
    };
  } else {
    if (process.env.VERCEL) throw new Error("DATABASE_URL is not set");
    // Local development fallback: embedded Postgres stored on disk.
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite("./.pglite");
    run = async (text, params = []) => (await db.query<Row>(text, params)).rows;
    exec = async (text) => {
      await db.exec(text);
    };
  }

  await exec(SCHEMA);
  return run;
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!globalThis.__pokedevRunner) {
    globalThis.__pokedevRunner = createRunner().catch((e) => {
      globalThis.__pokedevRunner = undefined;
      throw e;
    });
  }
  const run = await globalThis.__pokedevRunner;
  return (await run(text, params)) as T[];
}
