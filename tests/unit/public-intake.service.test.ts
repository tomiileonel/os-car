import { describe, expect, it, vi } from "vitest";
import type { PublicIntakeInput } from "@/shared/schemas";

const mocks = vi.hoisted(() => ({
  tx: {
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    vehicle: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    workOrder: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { registerPublicIntake } from "@/server/services/public-intake.service";

const validInput: PublicIntakeInput = {
  fullName: "María Taller",
  phoneE164: "+5491112345678",
  vehicleType: "AUTO",
  licensePlate: "AA123AA",
  make: "Toyota",
  model: "Corolla",
  modelYear: 2020,
  odometerAtIntake: 85000,
  fuelLevel: "MITAD",
  customerComplaint: "Hace ruido al frenar",
};

function configureTransaction(): void {
  process.env.OSCAR_WORKSHOP_ID = "workshop_1";
  mocks.prisma.$transaction.mockImplementation(
    (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
  );
  mocks.tx.customer.findFirst.mockResolvedValue({ id: "customer_1" });
  mocks.tx.vehicle.findFirst.mockResolvedValue({ id: "vehicle_1", customerId: "customer_1" });
  mocks.tx.workOrder.findFirst.mockResolvedValue(null);
}

describe("public intake active-order invariant", () => {
  it("rejects an intake when the vehicle already has a non-terminal order", async () => {
    vi.clearAllMocks();
    configureTransaction();
    mocks.tx.workOrder.findFirst.mockResolvedValue({ id: "order_existing", status: "EN_REPARACION" });

    await expect(registerPublicIntake(validInput)).rejects.toMatchObject({
      code: "ACTIVE_ORDER_EXISTS_FOR_VEHICLE",
      statusCode: 409,
    });
    expect(mocks.tx.workOrder.create).not.toHaveBeenCalled();
  });

  it("maps the database unique collision from two concurrent intakes to a domain 409", async () => {
    vi.clearAllMocks();
    configureTransaction();
    mocks.tx.workOrder.create
      .mockResolvedValueOnce({ id: "order_winner" })
      .mockRejectedValueOnce({
        code: "P2002",
        meta: { target: ["workshopId", "vehicleId"] },
      });

    const results = await Promise.allSettled([
      registerPublicIntake(validInput),
      registerPublicIntake(validInput),
    ]);
    const rejected = results.find((result) => result.status === "rejected");

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "ACTIVE_ORDER_EXISTS_FOR_VEHICLE", statusCode: 409 },
    });
  });
});
