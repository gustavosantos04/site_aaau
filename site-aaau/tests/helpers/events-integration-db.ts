import { PrismaClient } from "@prisma/client";

type TestDatabaseConfig = {
  testDatabaseUrlRaw: string;
  testDatabaseDirectUrlRaw: string | null;
  testDatabaseUrl: string;
  testDatabaseDirectUrl: string | null;
};

type ParsedDatabaseUrl = {
  rawUrl: string;
  protocol: "postgresql:" | "postgres:";
  hostname: string;
  database: string;
  isPooler: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
  hasAtSign: boolean;
  colonCountBeforeAt: number;
};

export function maskedDatabaseUrl(value: string) {
  try {
    const url = parseDatabaseUrl("database URL", value);
    return `${url.protocol}//${url.hostname}/${url.database}`;
  } catch {
    return "[invalid-url]";
  }
}

function parseDatabaseUrl(name: string, value: string) {
  const trimmed = value.trim();
  const protocolMatch = /^(postgresql|postgres):\/\//i.exec(trimmed);

  if (!protocolMatch) {
    throw new Error(`${name} precisa usar protocolo postgresql: ou postgres:.`);
  }

  const protocol = `${protocolMatch[1].toLowerCase()}:` as ParsedDatabaseUrl["protocol"];
  const afterProtocol = trimmed.slice(protocolMatch[0].length);
  const credentialSeparator = afterProtocol.lastIndexOf("@");
  const credentials = credentialSeparator >= 0 ? afterProtocol.slice(0, credentialSeparator) : "";
  const hostPathAndQuery = credentialSeparator >= 0
    ? afterProtocol.slice(credentialSeparator + 1)
    : afterProtocol;
  const pathStart = hostPathAndQuery.indexOf("/");

  if (pathStart < 0) {
    throw new Error(`${name} precisa informar o banco no pathname.`);
  }

  const hostWithPort = hostPathAndQuery.slice(0, pathStart);
  const pathAndQuery = hostPathAndQuery.slice(pathStart);
  const hostEnd = hostWithPort.startsWith("[")
    ? hostWithPort.indexOf("]") + 1
    : hostWithPort.indexOf(":") >= 0
      ? hostWithPort.indexOf(":")
      : hostWithPort.length;
  const port = hostWithPort.startsWith("[")
    ? hostWithPort.slice(hostEnd + 1).replace(/^:/, "")
    : hostWithPort.slice(hostEnd + 1);
  const hostname = hostWithPort.slice(0, hostEnd).replace(/^\[/, "").replace(/\]$/, "");
  const database = pathAndQuery.split(/[?#]/, 1)[0].replace(/^\//, "");

  if (!hostname || !database) {
    throw new Error(`${name} precisa informar host e banco.`);
  }

  if (port && !/^\d+$/.test(port)) {
    throw new Error(
      `${name} tem porta invalida. Verifique se usuario/senha estao separados do host por @ e se caracteres reservados da senha estao URL-encoded.`,
    );
  }

  return {
    rawUrl: trimmed,
    protocol,
    hostname,
    database,
    isPooler: hostname.toLowerCase().includes("-pooler"),
    hasUsername: credentials.length > 0,
    hasPassword: credentials.includes(":"),
    hasAtSign: credentialSeparator >= 0,
    colonCountBeforeAt: (credentials.match(/:/g) ?? []).length,
  };
}

export function getDatabaseUrlDiagnostics(value: string) {
  const parsed = parseDatabaseUrl("database URL", value);
  return {
    type: typeof value,
    length: parsed.rawUrl.length,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    hostContainsPooler: parsed.isPooler,
    database: parsed.database,
    startsWithPostgresProtocol:
      parsed.rawUrl.startsWith("postgresql://") || parsed.rawUrl.startsWith("postgres://"),
    hasAtSign: parsed.hasAtSign,
    colonCountBeforeAt: parsed.colonCountBeforeAt,
    hasUsername: parsed.hasUsername,
    hasPassword: parsed.hasPassword,
  };
}

export function getMigrationDatabaseUrl(config: TestDatabaseConfig) {
  if (!config.testDatabaseDirectUrlRaw) {
    throw new Error("TEST_DATABASE_DIRECT_URL precisa estar definida para executar migrations de integracao.");
  }

  return config.testDatabaseDirectUrlRaw;
}

function normalizedNeonHost(hostname: string) {
  return hostname.toLowerCase().replace("-pooler.", ".");
}

function assertNotProductionUrl(name: string, value: string, productionName: string, productionValue?: string) {
  if (productionValue?.trim() && productionValue.trim() === value) {
    throw new Error(`${name} nao pode ser igual a ${productionName} (${maskedDatabaseUrl(value)}).`);
  }
}

function assertSameTestDatabase(clientUrl: ParsedDatabaseUrl, directUrl: ParsedDatabaseUrl) {
  const sameNormalizedHost = normalizedNeonHost(clientUrl.hostname) === normalizedNeonHost(directUrl.hostname);

  if (clientUrl.database !== directUrl.database || !sameNormalizedHost) {
    throw new Error(
      [
        "TEST_DATABASE_URL e TEST_DATABASE_DIRECT_URL devem apontar para o mesmo banco de teste.",
        `client=${clientUrl.hostname}/${clientUrl.database}`,
        `direct=${directUrl.hostname}/${directUrl.database}`,
      ].join(" "),
    );
  }
}

export function getSafeTestDatabaseConfig(options: { requireDirectUrl?: boolean } = {}): TestDatabaseConfig {
  const testDatabaseUrlRaw = process.env.TEST_DATABASE_URL?.trim();
  const testDatabaseDirectUrlRaw = process.env.TEST_DATABASE_DIRECT_URL?.trim() || null;
  const appDatabaseUrl = process.env.DATABASE_URL?.trim();
  const appDirectUrl = process.env.DIRECT_URL?.trim();

  if (!testDatabaseUrlRaw) {
    throw new Error("TEST_DATABASE_URL precisa estar definida para testes de integracao.");
  }

  assertNotProductionUrl("TEST_DATABASE_URL", testDatabaseUrlRaw, "DATABASE_URL", appDatabaseUrl);
  assertNotProductionUrl("TEST_DATABASE_URL", testDatabaseUrlRaw, "DIRECT_URL", appDirectUrl);

  const parsedTestDatabaseUrl = parseDatabaseUrl("TEST_DATABASE_URL", testDatabaseUrlRaw);

  if (options.requireDirectUrl && !testDatabaseDirectUrlRaw) {
    throw new Error("TEST_DATABASE_DIRECT_URL precisa estar definida para executar migrations de integracao.");
  }

  if (testDatabaseDirectUrlRaw) {
    assertNotProductionUrl("TEST_DATABASE_DIRECT_URL", testDatabaseDirectUrlRaw, "DATABASE_URL", appDatabaseUrl);
    assertNotProductionUrl("TEST_DATABASE_DIRECT_URL", testDatabaseDirectUrlRaw, "DIRECT_URL", appDirectUrl);

    const parsedDirectUrl = parseDatabaseUrl("TEST_DATABASE_DIRECT_URL", testDatabaseDirectUrlRaw);

    if (parsedDirectUrl.isPooler) {
      throw new Error(
        `TEST_DATABASE_DIRECT_URL nao pode usar host pooled (${parsedDirectUrl.hostname}).`,
      );
    }

    assertSameTestDatabase(parsedTestDatabaseUrl, parsedDirectUrl);
  }

  return {
    testDatabaseUrlRaw,
    testDatabaseDirectUrlRaw,
    testDatabaseUrl: testDatabaseUrlRaw,
    testDatabaseDirectUrl: testDatabaseDirectUrlRaw,
  };
}

export function assertSafeTestDatabase() {
  return getSafeTestDatabaseConfig().testDatabaseUrlRaw;
}

const testDatabaseUrl = assertSafeTestDatabase();

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: testDatabaseUrl,
    },
  },
});

export async function cleanEventTestData() {
  assertSafeTestDatabase();

  await testPrisma.paymentEvent.deleteMany({ where: { eventOrderId: { not: null } } });
  await testPrisma.eventCheckInLog.deleteMany();
  await testPrisma.eventAdminAuditLog.deleteMany();
  await testPrisma.eventStaffAssignment.deleteMany();
  await testPrisma.eventTicket.deleteMany();
  await testPrisma.eventOrderParticipant.deleteMany();
  await testPrisma.eventOrder.deleteMany();
  await testPrisma.eventPartnerCode.deleteMany();
  await testPrisma.eventTicketLot.deleteMany();
  await testPrisma.ticketEvent.deleteMany();
  await testPrisma.adminUser.deleteMany({
    where: { email: { endsWith: "@event-test.local" } },
  });
}

export async function disconnectTestPrisma() {
  await testPrisma.$disconnect();
}
