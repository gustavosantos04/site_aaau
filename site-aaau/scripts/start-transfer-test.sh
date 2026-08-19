#!/bin/sh
set -eu

echo "Preparing isolated transfer-test database schema..."
npx prisma db push --skip-generate
npx tsx scripts/transfer-test-fixture.ts ensure

exec npm run dev -- --hostname 0.0.0.0

