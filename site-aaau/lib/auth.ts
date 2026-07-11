import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/password";

const ADMIN_SESSION_COOKIE = "aaau_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

type AdminSessionPayload = {
  email: string;
  role: AdminRole;
  adminUserId: string | null;
  exp: number;
};

export type AdminRole = "super_admin" | "event_staff";

export type AdminActor = {
  email: string;
  role: AdminRole;
  adminUserId: string | null;
};

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getJwtSecret() {
  return process.env.JWT_SECRET?.trim() || null;
}

function getLegacyAdminEnv() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) {
    return null;
  }

  return { email, password };
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

    return {
      email: parsed.email,
      role: parsed.role === "event_staff" ? "event_staff" : "super_admin",
      adminUserId: parsed.adminUserId ?? null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function createAdminSessionToken(actor: AdminActor, secret: string, now = Date.now()) {
  return serializeSession(
    {
      email: actor.email.trim().toLowerCase(),
      role: actor.role,
      adminUserId: actor.adminUserId,
      exp: now + SESSION_TTL_SECONDS * 1000,
    },
    secret,
  );
}

export function parseAdminSessionToken(token: string, secret: string) {
  return parseSession(token, secret);
}

export function isAdminAuthConfigured() {
  return getJwtSecret() !== null;
}

export function getAdminAuthMissingMessage() {
  if (isAdminAuthConfigured()) {
    return null;
  }

  return "Configure JWT_SECRET para liberar o login administrativo.";
}

export async function authenticateAdmin(email: string, password: string) {
  const legacyAdmin = getLegacyAdminEnv();
  const normalizedEmail = email.trim().toLowerCase();

  if (!getJwtSecret()) {
    return null;
  }

  if (legacyAdmin && safeCompare(normalizedEmail, legacyAdmin.email) && safeCompare(password, legacyAdmin.password)) {
    return {
      email: legacyAdmin.email,
      role: "super_admin" as const,
      adminUserId: null,
    };
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, passwordHash: true, role: true, isActive: true },
  });

  if (!adminUser?.isActive || adminUser.role !== "event_staff") {
    return null;
  }

  const passwordMatches = await verifyPassword(password, adminUser.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return {
    email: adminUser.email,
    role: "event_staff" as const,
    adminUserId: adminUser.id,
  };
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

export async function createAdminSession(actor: AdminActor) {
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    throw new Error("Admin auth environment is not configured.");
  }

  const cookieStore = await cookies();
  const token = createAdminSessionToken(actor, jwtSecret);

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
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = parseSession(token, jwtSecret);

  if (!session) {
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

export async function requireAdminRole(role: AdminRole) {
  const session = await requireAdminSession();
  const actor: AdminActor = {
    email: session.email,
    role: session.role,
    adminUserId: session.adminUserId,
  };

  if (role === "super_admin" && actor.role !== "super_admin") {
    redirect("/admin");
  }

  return actor;
}

export async function requireAnyAdminRole(roles: AdminRole[], redirectTo = "/admin/login") {
  const session = await getAdminSession();

  if (!session || !roles.includes(session.role)) {
    redirect(redirectTo as never);
  }

  return {
    email: session.email,
    role: session.role,
    adminUserId: session.adminUserId,
  } satisfies AdminActor;
}

export { hashPassword, verifyPassword } from "@/lib/password";
