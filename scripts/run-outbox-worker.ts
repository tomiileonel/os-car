/**
 * OS-CAR · Gate G5 — Entry point del Outbox Job Worker (runtime Node.js).
 * Ejecución: pnpm tsx scripts/run-outbox-worker.ts
 * (o como proceso/cron independiente en despliegue).
 */
import { registerDefaultOutboxHandlers, startOutboxWorker } from "../src/server/jobs/worker";
import { logger } from "../src/shared/telemetry/logger";

registerDefaultOutboxHandlers();

const rawPollIntervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000);
const rawBatchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 10);

const pollIntervalMs = Number.isFinite(rawPollIntervalMs) && rawPollIntervalMs > 0 ? rawPollIntervalMs : 2000;
const batchSize = Number.isFinite(rawBatchSize) && rawBatchSize > 0 ? rawBatchSize : 10;

const worker = startOutboxWorker({
  pollIntervalMs,
  batchSize,
  workerId: `worker-${process.pid}-${Date.now()}`,
});

logger.info("outbox worker iniciado", {
  metadata: { pollIntervalMs, batchSize, pid: process.pid },
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("outbox worker deteniéndose", { metadata: { signal } });
  await worker.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

