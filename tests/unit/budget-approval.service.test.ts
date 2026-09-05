import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@/shared/errors";
import {
  assertActiveWorkshopUser,
  decideBudgetVersionInTx,
} from "@/server/services/budget-approval.service";
import type { BudgetApprovalServiceTx } from "@/server/services/budget-approval.service";

function buildBudgetApprovalTxMock(): BudgetApprovalServiceTx {
  const versionRow = {
    id: "bv_1",
    status: "PENDIENTE_APROBACION",
    budgetId: "b_1",
    versionNumber: 1,
    budget: {
      workOrderId: "wo_1",
      workOrder: { workshopId: "ws_1" },
    },
    laborLines: [
      { description: "Cambio de aceite", estimatedMinutes: 60, hourlyRateCharged: "5000.00" },
    ],
    partLines: [
      { description: "Filtro de aceite", quantity: 1, unitPriceCharged: "1500.00" },
    ],
  };

  return {
    workOrder: {
      findFirst: vi.fn().mockResolvedValue({ id: "wo_1", status: "PRESUPUESTADO", createdById: "au_admin" }),
    },
    workItem: { findMany: vi.fn().mockResolvedValue([]) },
    partItem: { findMany: vi.fn().mockResolvedValue([]) },
    budget: {
      findFirst: vi.fn().mockResolvedValue({ currentVersion: { status: "PENDIENTE_APROBACION" } }),
      update: vi.fn().mockResolvedValue({ id: "b_1" }),
    },
    intakeRecord: { findFirst: vi.fn().mockResolvedValue({ id: "ir_1" }) },
    qualityControl: { findFirst: vi.fn().mockResolvedValue(null) },
    orderBlocker: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "ob_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    adminUser: {
      findFirst: vi.fn().mockResolvedValue({
        id: "au_admin",
        workshopId: "ws_1",
        active: true,
        role: "ADMIN",
      }),
    },
    budgetVersion: {
      findFirst: vi.fn().mockResolvedValue(versionRow),
      update: vi.fn().mockResolvedValue({ id: "bv_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    budgetApproval: {
      create: vi.fn().mockResolvedValue({ id: "ba_1" }),
    },
    statusHistory: {
      create: vi.fn().mockResolvedValue({ id: "sh_1" }),
    },
  };
}

describe("BudgetApprovalService — B1, S2 e Invariantes de Aprobación", () => {
  it("B1: aprobación administrativa persiste actorAdminId correctamente y NO resolvedByUserId", async () => {
    const tx = buildBudgetApprovalTxMock();

    await decideBudgetVersionInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      budgetVersionId: "bv_1",
      decision: "APROBADO",
      actorType: "ADMIN",
      actorAdminId: "au_admin",
    });

    expect(tx.budgetApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          budgetVersionId: "bv_1",
          actorType: "ADMIN",
          actorAdminId: "au_admin",
          decision: "APROBADO",
        }),
      })
    );

    const callArgs = vi.mocked(tx.budgetApproval.create).mock.calls[0][0];
    expect(callArgs.data).not.toHaveProperty("resolvedByUserId");
  });

  it("B1: decisión de CLIENTE deja actorAdminId en null", async () => {
    const tx = buildBudgetApprovalTxMock();

    await decideBudgetVersionInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      budgetVersionId: "bv_1",
      decision: "APROBADO",
      actorType: "CLIENTE",
      phoneHash: "hash_phone_123",
    });

    expect(tx.budgetApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: "CLIENTE",
          actorAdminId: null,
          decision: "APROBADO",
        }),
      })
    );
  });

  it("S2: assertActiveWorkshopUser valida pertenencia de tenant y estado activo", async () => {
    const tx = buildBudgetApprovalTxMock();
    const user = await assertActiveWorkshopUser(tx, "ws_1", "au_admin");
    expect(user.id).toBe("au_admin");

    vi.mocked(tx.adminUser.findFirst).mockResolvedValueOnce(null);
    await expect(assertActiveWorkshopUser(tx, "ws_2", "au_admin")).rejects.toThrow(ForbiddenException);
  });

  it("aprobación marca versiones anteriores como SUPERSEDED", async () => {
    const tx = buildBudgetApprovalTxMock();

    await decideBudgetVersionInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      budgetVersionId: "bv_1",
      decision: "APROBADO",
      actorType: "ADMIN",
      actorAdminId: "au_admin",
    });

    expect(tx.budgetVersion.updateMany).toHaveBeenCalledWith({
      where: { budgetId: "b_1", status: "APROBADO", id: { not: "bv_1" } },
      data: { status: "SUPERSEDED" },
    });
  });

  it("rechazo persiste motivo de rechazo y actualiza versión a RECHAZADO", async () => {
    const tx = buildBudgetApprovalTxMock();

    await decideBudgetVersionInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      budgetVersionId: "bv_1",
      decision: "RECHAZADO",
      actorType: "ADMIN",
      actorAdminId: "au_admin",
      rejectionReason: "Costo excesivo de repuesto",
    });

    expect(tx.budgetVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bv_1" },
        data: expect.objectContaining({
          status: "RECHAZADO",
          rejectionReason: "Costo excesivo de repuesto",
        }),
      })
    );
  });
});
