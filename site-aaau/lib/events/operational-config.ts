import { getTransactionalEmailConfig } from "@/lib/email/delivery";

const MINIMUM_SECRET_LENGTH = 32;

type SecretName =
  | "EVENT_TICKET_TRANSFER_TOKEN_SECRET"
  | "EVENT_TICKET_TRANSFER_OUTBOX_SECRET"
  | "EVENT_TICKET_PORTAL_SECRET"
  | "CRON_SECRET";

function enabled(name: "EVENT_TICKET_TRANSFERS_ENABLED" | "EVENT_TICKET_PORTAL_ENABLED") {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function requireSecret(name: SecretName) {
  const value = process.env[name]?.trim();
  if (!value || value.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(`${name} precisa ter pelo menos ${MINIMUM_SECRET_LENGTH} caracteres.`);
  }
  return value;
}

function assertDistinctSecrets(entries: Array<[SecretName, string | undefined]>) {
  const configured = entries
    .map(([name, value]) => [name, value?.trim()] as const)
    .filter((entry): entry is readonly [SecretName, string] => Boolean(entry[1]));
  for (let left = 0; left < configured.length; left += 1) {
    for (let right = left + 1; right < configured.length; right += 1) {
      if (configured[left][1] === configured[right][1]) {
        throw new Error(`${configured[left][0]} e ${configured[right][0]} precisam usar secrets diferentes.`);
      }
    }
  }
}

function assertOperationalAppUrl() {
  const raw = process.env.APP_URL?.trim();
  if (!raw) throw new Error("APP_URL precisa estar configurada para operar ingressos.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("APP_URL precisa ser uma URL absoluta valida.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL precisa ser uma origem HTTP(S) sem credenciais, query string ou fragmento.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL precisa usar HTTPS em producao.");
  }
  return url.origin;
}

export function validateEventTicketOperationalConfig(options: {
  requireTransfers?: boolean;
  requirePortal?: boolean;
  requireCron?: boolean;
} = {}) {
  const transfersEnabled = enabled("EVENT_TICKET_TRANSFERS_ENABLED");
  const portalEnabled = enabled("EVENT_TICKET_PORTAL_ENABLED");
  const needsTransfers = options.requireTransfers ?? transfersEnabled;
  const needsPortal = options.requirePortal ?? portalEnabled;

  if (needsTransfers && !transfersEnabled) throw new Error("EVENT_TICKET_TRANSFERS_DISABLED");
  if (needsPortal && !portalEnabled) throw new Error("EVENT_TICKET_PORTAL_DISABLED");

  if (!needsTransfers && !needsPortal && !options.requireCron) {
    return { transfersEnabled, portalEnabled, emailProvider: null, appOrigin: null };
  }

  const tokenSecret = needsTransfers || needsPortal
    ? requireSecret("EVENT_TICKET_TRANSFER_TOKEN_SECRET")
    : process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  const outboxSecret = needsTransfers
    ? requireSecret("EVENT_TICKET_TRANSFER_OUTBOX_SECRET")
    : process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET;
  const portalSecret = needsPortal
    ? requireSecret("EVENT_TICKET_PORTAL_SECRET")
    : process.env.EVENT_TICKET_PORTAL_SECRET;
  const cronSecret = options.requireCron ? requireSecret("CRON_SECRET") : process.env.CRON_SECRET;

  assertDistinctSecrets([
    ["EVENT_TICKET_TRANSFER_TOKEN_SECRET", tokenSecret],
    ["EVENT_TICKET_TRANSFER_OUTBOX_SECRET", outboxSecret],
    ["EVENT_TICKET_PORTAL_SECRET", portalSecret],
    ["CRON_SECRET", cronSecret],
  ]);

  const email = needsTransfers || needsPortal ? getTransactionalEmailConfig() : null;
  if ((needsTransfers || needsPortal) && !email) {
    throw new Error("Configure Resend ou SMTP antes de ativar ingressos.");
  }

  return {
    transfersEnabled,
    portalEnabled,
    emailProvider: email?.provider ?? null,
    appOrigin: needsTransfers || needsPortal ? assertOperationalAppUrl() : null,
  };
}
