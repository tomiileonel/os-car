import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, DomainConflictException } from "@/shared/errors";
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
      currentVersionId: "bv_1",
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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

  describe("Invariante BUDGET-01 — Validación de Versión Vigente", () => {
    it("arroja DomainConflictException(BUDGET_VERSION_SUPERSEDED) si la versión fue superada por una nueva versión", async () => {
      const tx = buildBudgetApprovalTxMock();
      // Simula que la versión vigente en el Budget es bv_2, pero se intenta aprobar bv_1
      vi.mocked(tx.budgetVersion.findFirst).mockResolvedValueOnce({
        id: "bv_1",
        status: "PENDIENTE_APROBACION",
        budgetId: "b_1",
        versionNumber: 1,
        budget: {
          workOrderId: "wo_1",
          currentVersionId: "bv_2", // Versión 2 vigente
          workOrder: { workshopId: "ws_1" },
        },
        laborLines: [],
        partLines: [],
      });

      await expect(
        decideBudgetVersionInTx(tx, {
          workshopId: "ws_1",
          workOrderId: "wo_1",
          budgetVersionId: "bv_1",
          decision: "APROBADO",
          actorType: "ADMIN",
          actorAdminId: "au_admin",
        })
      ).rejects.toMatchObject({
        name: "DomainConflictException",
        code: "BUDGET_VERSION_SUPERSEDED",
        details: expect.objectContaining({
          requestedVersionId: "bv_1",
          currentVersionId: "bv_2",
          workOrderId: "wo_1",
        }),
      });
    });

    it("permite decidir una versión cuando coincide con currentVersionId", async () => {
      const tx = buildBudgetApprovalTxMock();
      // currentVersionId es bv_1 y se aprueba bv_1
      const result = await decideBudgetVersionInTx(tx, {
        workshopId: "ws_1",
        workOrderId: "wo_1",
        budgetVersionId: "bv_1",
        decision: "APROBADO",
        actorType: "ADMIN",
        actorAdminId: "au_admin",
      });

      expect(result.budgetVersionId).toBe("bv_1");
      expect(result.decision).toBe("APROBADO");
      expect(tx.budget.updateMany).toHaveBeenCalledWith({
        where: { id: "b_1", currentVersionId: "bv_1" },
        data: { currentVersionId: "bv_1" },
      });
    });

    it("previene condición de carrera rechazando aprobación si la versión quedó desactualizada", async () => {
      const tx = buildBudgetApprovalTxMock();
      vi.mocked(tx.budgetVersion.findFirst).mockResolvedValueOnce({
        id: "bv_old",
        status: "PENDIENTE_APROBACION",
        budgetId: "b_1",
        versionNumber: 1,
        budget: {
          workOrderId: "wo_1",
          currentVersionId: "bv_published_race",
          workOrder: { workshopId: "ws_1" },
        },
        laborLines: [],
        partLines: [],
      });

      await expect(
        decideBudgetVersionInTx(tx, {
          workshopId: "ws_1",
          workOrderId: "wo_1",
          budgetVersionId: "bv_old",
          decision: "APROBADO",
          actorType: "CLIENTE",
        })
      ).rejects.toThrow(DomainConflictException);
    });

    it("permite decidir una versión inicial cuando currentVersionId es null y consolida la versión en el presupuesto", async () => {
      const tx = buildBudgetApprovalTxMock();
      vi.mocked(tx.budgetVersion.findFirst).mockResolvedValueOnce({
        id: "bv_initial",
        status: "PENDIENTE_APROBACION",
        budgetId: "b_1",
        versionNumber: 1,
        budget: {
          workOrderId: "wo_1",
          currentVersionId: null, // Presupuesto inicial sin versión consolidada previa
          workOrder: { workshopId: "ws_1" },
        },
        laborLines: [],
        partLines: [],
      });

      const result = await decideBudgetVersionInTx(tx, {
        workshopId: "ws_1",
        workOrderId: "wo_1",
        budgetVersionId: "bv_initial",
        decision: "APROBADO",
        actorType: "ADMIN",
        actorAdminId: "au_admin",
      });

      expect(result.decision).toBe("APROBADO");
      expect(tx.budget.updateMany).toHaveBeenCalledWith({
        where: { id: "b_1", currentVersionId: null },
        data: { currentVersionId: "bv_initial" },
      });
    });

    it("ejecuta CAS de validación al rechazar la versión inicial sin pervertir currentVersionId", async () => {
      const tx = buildBudgetApprovalTxMock();
      vi.mocked(tx.budgetVersion.findFirst).mockResolvedValueOnce({
        id: "bv_rejected_initial",
        status: "PENDIENTE_APROBACION",
        budgetId: "b_1",
        versionNumber: 1,
        budget: {
          workOrderId: "wo_1",
          currentVersionId: null,
          workOrder: { workshopId: "ws_1" },
        },
        laborLines: [],
        partLines: [],
      });

      const result = await decideBudgetVersionInTx(tx, {
        workshopId: "ws_1",
        workOrderId: "wo_1",
        budgetVersionId: "bv_rejected_initial",
        decision: "RECHAZADO",
        actorType: "ADMIN",
        actorAdminId: "au_admin",
        rejectionReason: "Presupuesto inicial desestimado por el cliente",
      });

      expect(result.decision).toBe("RECHAZADO");
      expect(tx.budget.updateMany).toHaveBeenCalledWith({
        where: { id: "b_1", currentVersionId: null },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it("CAS collision: arroja BUDGET_VERSION_SUPERSEDED si tx.budget.updateMany retorna count 0 durante la aprobación", async () => {
      const tx = buildBudgetApprovalTxMock();
      // Simula colisión concurrente donde otra transacción actualizó currentVersionId entre el findFirst y el updateMany
      vi.mocked(tx.budget.updateMany).mockResolvedValueOnce({ count: 0 });

      await expect(
        decideBudgetVersionInTx(tx, {
          workshopId: "ws_1",
          workOrderId: "wo_1",
          budgetVersionId: "bv_1",
          decision: "APROBADO",
          actorType: "ADMIN",
          actorAdminId: "au_admin",
        })
      ).rejects.toThrow(DomainConflictException);
    });

    it("CAS collision: arroja BUDGET_VERSION_SUPERSEDED si tx.budget.updateMany retorna count 0 durante el rechazo inicial", async () => {
      const tx = buildBudgetApprovalTxMock();
      vi.mocked(tx.budgetVersion.findFirst).mockResolvedValueOnce({
        id: "bv_init_clash",
        status: "PENDIENTE_APROBACION",
        budgetId: "b_1",
        versionNumber: 1,
        budget: {
          workOrderId: "wo_1",
          currentVersionId: null,
          workOrder: { workshopId: "ws_1" },
        },
        laborLines: [],
        partLines: [],
      });
      vi.mocked(tx.budget.updateMany).mockResolvedValueOnce({ count: 0 });

      await expect(
        decideBudgetVersionInTx(tx, {
          workshopId: "ws_1",
          workOrderId: "wo_1",
          budgetVersionId: "bv_init_clash",
          decision: "RECHAZADO",
          actorType: "ADMIN",
          actorAdminId: "au_admin",
          rejectionReason: "Rechazo concurrente en versión inicial",
        })
      ).rejects.toThrow(DomainConflictException);
    });
  });
});

