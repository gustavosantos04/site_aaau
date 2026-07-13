import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  EVENT_TRANSACTION_MAX_RETRIES,
  EVENT_TRANSACTION_RETRY_BASE_DELAY_MS,
} from "@/lib/events/constants";
import type { EventTx } from "@/lib/events/types";

type TransactionRetryReason = "P2034" | "P2010_40001" | "P2010_40P01";

type TransactionRetryMetrics = {
  transactionConflictDetected: number;
  transactionRetryExecuted: number;
  retryReason: Record<TransactionRetryReason, number>;
};

const RETRYABLE_RAW_QUERY_SQLSTATES = new Set(["40001", "40P01"]);

const transactionRetryMetrics: TransactionRetryMetrics = {
  transactionConflictDetected: 0,
  transactionRetryExecuted: 0,
  retryReason: {
    P2034: 0,
    P2010_40001: 0,
    P2010_40P01: 0,
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPrismaErrorMetaCode(error: Prisma.PrismaClientKnownRequestError) {
  const meta = error.meta;

  if (!meta || typeof meta !== "object" || !("code" in meta)) {
    return null;
  }

  const nativeCode = meta.code;
  return typeof nativeCode === "string" ? nativeCode : null;
}

export function getRetryableTransactionConflictReason(
  error: unknown,
): TransactionRetryReason | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  if (error.code === "P2034") {
    return "P2034";
  }

  if (error.code !== "P2010") {
    return null;
  }

  const nativeCode = getPrismaErrorMetaCode(error);

  if (!nativeCode || !RETRYABLE_RAW_QUERY_SQLSTATES.has(nativeCode)) {
    return null;
  }

  return nativeCode === "40001" ? "P2010_40001" : "P2010_40P01";
}

export function isRetryableTransactionConflict(error: unknown) {
  return getRetryableTransactionConflictReason(error) !== null;
}

export function resetTransactionRetryMetrics() {
  transactionRetryMetrics.transactionConflictDetected = 0;
  transactionRetryMetrics.transactionRetryExecuted = 0;
  transactionRetryMetrics.retryReason.P2034 = 0;
  transactionRetryMetrics.retryReason.P2010_40001 = 0;
  transactionRetryMetrics.retryReason.P2010_40P01 = 0;
}

export function getTransactionRetryMetrics(): TransactionRetryMetrics {
  return {
    transactionConflictDetected: transactionRetryMetrics.transactionConflictDetected,
    transactionRetryExecuted: transactionRetryMetrics.transactionRetryExecuted,
    retryReason: { ...transactionRetryMetrics.retryReason },
  };
}

export async function runSerializableTransactionWithRetry<T>(
  operation: (tx: EventTx) => Promise<T>,
  maxRetries = EVENT_TRANSACTION_MAX_RETRIES,
) {
  let attempt = 0;

  while (true) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      attempt += 1;
      const retryReason = getRetryableTransactionConflictReason(error);

      if (!retryReason) {
        throw error;
      }

      transactionRetryMetrics.transactionConflictDetected += 1;
      transactionRetryMetrics.retryReason[retryReason] += 1;

      if (attempt >= maxRetries) {
        throw error;
      }

      transactionRetryMetrics.transactionRetryExecuted += 1;
      await sleep(EVENT_TRANSACTION_RETRY_BASE_DELAY_MS * attempt);
    }
  }
}
