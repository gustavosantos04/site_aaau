import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$16384$8$1$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, n, r, p, salt, expected] = passwordHash.split("$");

  if (scheme !== "scrypt" || !n || !r || !p || !salt || !expected) {
    return false;
  }

  const key = await scryptAsync(password, salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  const expectedBuffer = Buffer.from(expected, "base64url");

  if (key.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(key, expectedBuffer);
}

function scryptAsync(
  password: string,
  salt: string,
  keyLength: number,
  options?: { N: number; r: number; p: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options ?? {}, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
