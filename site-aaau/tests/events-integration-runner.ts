import { spawnSync } from "node:child_process";

import {
  getDatabaseUrlDiagnostics,
  getMigrationDatabaseUrl,
  getSafeTestDatabaseConfig,
  maskedDatabaseUrl,
} from "@/tests/helpers/events-integration-db";

const testDatabaseConfig = getSafeTestDatabaseConfig({
  requireDirectUrl: true,
});
const migrationDatabaseUrl = getMigrationDatabaseUrl(testDatabaseConfig);
const migrationDiagnostics = getDatabaseUrlDiagnostics(migrationDatabaseUrl);

console.log(`Using integration test database: ${maskedDatabaseUrl(testDatabaseConfig.testDatabaseUrlRaw)}`);
console.log(`Using direct migration database: ${maskedDatabaseUrl(migrationDatabaseUrl)}`);
console.log(
  [
    "Migration database URL diagnostics:",
    `type=${migrationDiagnostics.type}`,
    `length=${migrationDiagnostics.length}`,
    `protocol=${migrationDiagnostics.protocol}`,
    `hostname=${migrationDiagnostics.hostname}`,
    `hostContainsPooler=${migrationDiagnostics.hostContainsPooler}`,
    `database=${migrationDiagnostics.database}`,
    `startsWithPostgresProtocol=${migrationDiagnostics.startsWithPostgresProtocol}`,
    `hasAtSign=${migrationDiagnostics.hasAtSign}`,
    `colonCountBeforeAt=${migrationDiagnostics.colonCountBeforeAt}`,
    `hasUsername=${migrationDiagnostics.hasUsername}`,
    `hasPassword=${migrationDiagnostics.hasPassword}`,
    `matchesTrimmedDirectEnv=${migrationDatabaseUrl === process.env.TEST_DATABASE_DIRECT_URL?.trim()}`,
  ].join(" "),
);

function runMigrateDeploy() {
  return spawnSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: migrationDatabaseUrl,
    },
    encoding: "utf8",
    shell: true,
  });
}

let migrate = runMigrateDeploy();

if (migrate.stdout) process.stdout.write(migrate.stdout);
if (migrate.stderr) process.stderr.write(migrate.stderr);

if ((migrate.status ?? 1) !== 0 && `${migrate.stdout ?? ""}\n${migrate.stderr ?? ""}`.includes("P1002")) {
  console.warn("Prisma migrate hit advisory lock timeout (P1002); retrying migrate deploy once.");
  migrate = runMigrateDeploy();
  if (migrate.stdout) process.stdout.write(migrate.stdout);
  if (migrate.stderr) process.stderr.write(migrate.stderr);
}

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const test = spawnSync("npx", ["tsx", "--test", "tests/events-integration.test.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TEST_DATABASE_URL: testDatabaseConfig.testDatabaseUrlRaw,
    NODE_ENV: "test",
  },
  shell: true,
  stdio: "inherit",
});

process.exit(test.status ?? 1);
