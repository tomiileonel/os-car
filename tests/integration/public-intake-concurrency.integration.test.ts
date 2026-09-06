import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.G5_NEON_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("H-1 — PostgreSQL backstop for active work orders", () => {
  let prisma: PrismaClient | undefined;
  let workshopId: string;
  let customerId: string;
  let vehicleId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();

    const workshop = await prisma.workshop.create({
      data: { name: `H1-Concurrency-${Date.now()}` },
    });
    workshopId = workshop.id;

    const customer = await prisma.customer.create({
      data: {
        workshopId,
        fullName: "Cliente H-1",
        phoneE164: `+54911${Date.now().toString().slice(-8)}`,
        phoneNormalized: `54911${Date.now().toString().slice(-8)}`,
      },
    });
    customerId = customer.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        workshopId,
        customerId,
        licensePlate: "H1001AA",
        licensePlateNormalized: "H1001AA",
        make: "Toyota",
        model: "Corolla",
        modelYear: 2020,
      },
    });
    vehicleId = vehicle.id;
  }, 30_000);

  afterAll(async () => {
    if (!prisma) return;

    if (!workshopId) {
      await prisma.$disconnect();
      return;
    }

    try {
      await prisma.workOrder.deleteMany({ where: { workshopId } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.workshop.delete({ where: { id: workshopId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it(
    "under ReadCommitted, two empty reads yield one committed order and one P2002",
    async () => {
      if (!prisma) throw new Error("TEST_DATABASE_URL no inicializada.");
      const database = prisma;

      let observedReads = 0;
      let releaseBarrier: () => void = () => undefined;
      const bothTransactionsReadEmpty = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });

      const waitForSecondRead = async (): Promise<void> => {
        observedReads += 1;
        if (observedReads === 2) releaseBarrier();
        await bothTransactionsReadEmpty;
      };

      const createOrder = (worker: string) =>
        database.$transaction(async (tx) => {
          const activeOrder = await tx.workOrder.findFirst({
            where: {
              workshopId,
              vehicleId,
              deletedAt: null,
              status: { notIn: ["ENTREGADO", "CANCELADA"] },
            },
            select: { id: true },
          });
          expect(activeOrder).toBeNull();

          await waitForSecondRead();

          return tx.workOrder.create({
            data: {
              workshopId,
              customerId,
              vehicleId,
              trackingCodeHash: createHash("sha256")
                .update(`h1-${worker}-${Date.now()}-${Math.random()}`)
                .digest("hex"),
              status: "INGRESADO",
            },
          });
        });

      const results = await Promise.allSettled([createOrder("a"), createOrder("b")]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ reason: { code: "P2002" } });

      const activeOrders = await database.workOrder.count({
        where: {
          workshopId,
          vehicleId,
          deletedAt: null,
          status: { notIn: ["ENTREGADO", "CANCELADA"] },
        },
      });
      expect(activeOrders).toBe(1);
    },
    45_000
  );
});
