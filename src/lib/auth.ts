import "server-only";
import { cookies } from "next/headers";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { q } from "./db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "pokedev_session";

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [saltHex, hashHex] = stored.split(":");
  const hash = await scrypt(pw, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  await q("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, userId]);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE token = $1", [token]);
  jar.delete(COOKIE);
}

export type SessionUser = {
  id: number;
  username: string;
  display_name: string;
  building: string;
  type: string;
  x_handle: string;
  farcaster: string;
  telegram: string;
  catchable: boolean;
  has_face: boolean;
};

export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await q<SessionUser>(
    `SELECT u.id, u.username, u.display_name, u.building, u.type, u.x_handle, u.farcaster,
            u.telegram, u.catchable, (u.face IS NOT NULL) AS has_face
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
    [token],
  );
  return rows[0] ?? null;
}
