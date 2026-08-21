import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("lembrete administrativo oferece somente envio imediato sem cron frequente", () => {
  const form = readFileSync(
    path.join(process.cwd(), "components/admin/ticket-reminder-campaign-form.tsx"),
    "utf8",
  );
  const actions = readFileSync(path.join(process.cwd(), "app/admin/eventos/actions.ts"), "utf8");
  const vercel = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));

  assert.match(form, /Enviar agora/);
  assert.doesNotMatch(form, /Agendar|datetime-local|scheduledFor/);
  assert.doesNotMatch(actions, /formData\.get\("scheduledFor"\)/);
  assert.deepEqual(vercel.crons, [
    { path: "/api/internal/event-ticket-outbox", schedule: "0 9 * * *" },
  ]);
  assert.doesNotMatch(JSON.stringify(vercel), /"\* \* \* \* \*"/);
  assert.match(actions, /processTicketReminderCampaignUntilIdle/);
});
