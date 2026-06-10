import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_SESSION_COOKIE = "aaau_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type AdminSessionPayload = {
  email: string;
  exp: number;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getAdminEnv() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (!email || !password || !jwtSecret) {
    return null;
  }

  return { email, password, jwtSecret };
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function serializeSession(payload: AdminSessionPayload, secret: string) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function parseSession(token: string, secret: string): AdminSessionPayload | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);

  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as AdminSessionPayload;

    if (!parsed.email || !parsed.exp || parsed.exp <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function isAdminAuthConfigured() {
  return getAdminEnv() !== null;
}

export function getAdminAuthMissingMessage() {
  if (isAdminAuthConfigured()) {
    return null;
  }

  return "Configure ADMIN_EMAIL, ADMIN_PASSWORD e JWT_SECRET para liberar o painel admin.";
}

export async function authenticateAdmin(email: string, password: string) {
  const adminEnv = getAdminEnv();

  if (!adminEnv) {
    return false;
  }

  return (
    safeCompare(email.trim().toLowerCase(), adminEnv.email) &&
    safeCompare(password, adminEnv.password)
  );
}

export function checkAdminLoginRateLimit(key: string) {
  const now = Date.now();
  const bucket = loginAttempts.get(key);

  if (!bucket || bucket.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }

  if (bucket.count >= LOGIN_MAX_ATTEMPTS) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export async function createAdminSession(email: string) {
  const adminEnv = getAdminEnv();

  if (!adminEnv) {
    throw new Error("Admin auth environment is not configured.");
  }

  const cookieStore = await cookies();
  const token = serializeSession(
    {
      email: email.trim().toLowerCase(),
      exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    },
    adminEnv.jwtSecret,
  );

  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function getAdminSession() {
  const adminEnv = getAdminEnv();

  if (!adminEnv) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = parseSession(token, adminEnv.jwtSecret);

  if (!session || !safeCompare(session.email, adminEnv.email)) {
    return null;
  }

  return session;
}

export async function requireAdminSession() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}
