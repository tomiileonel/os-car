import { describe, expect, it, vi } from "vitest";
import { DomainConflictException } from "@/shared/errors";
import {
  assertTransitionAllowedInTx,
  assertTransitionNotBlocked,
  collectBlockers,
  prioritizeBlockers,
  recalculateBlockersInTx,
} from "@/server/services/order-blocker.service";
import type { BlockerServiceTx, BlockerSnapshotInput } from "@/server/services/order-blocker.service";

function cleanSnapshot(overrides: Partial<BlockerSnapshotInput> = {}): BlockerSnapshotInput {
  return {
    orderStatus: "ESPERANDO_REPARACION",
    intakeRecord: { id: "ir_1" },
    partItems: [],
    workItems: [],
    budgetVersionStatus: "APROBADO",
    qualityControlPassed: null,
    capacityBlocked: false,
    ...overrides,
  };
}

function buildBlockerTxMock(snapshot: {
  partItems: Array<{ status: string; requiresApproval: boolean }>;
  budgetStatus: string | null;
}): BlockerServiceTx {
  return {
    workOrder: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "wo_1", status: "ESPERANDO_REPARACION" }),
    },
    partItem: { findMany: vi.fn().mockResolvedValue(snapshot.partItems) },
    workItem: { findMany: vi.fn().mockResolvedValue([]) },
    budget: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          snapshot.budgetStatus ? { currentVersion: { status: snapshot.budgetStatus } } : null
        ),
    },
    intakeRecord: { findFirst: vi.fn().mockResolvedValue({ id: "ir_1" }) },
    qualityControl: { findFirst: vi.fn().mockResolvedValue(null) },
    orderBlocker: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "ob_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe("OrderBlockerService — Invariante A1", () => {
  it("prioriza APROBACION_CLIENTE sobre REPUESTO_PENDIENTE y OTRO", () => {
    const primary = prioritizeBlockers(["OTRO", "REPUESTO_PENDIENTE", "APROBACION_CLIENTE"]);
    expect(primary).toBe("APROBACION_CLIENTE");
  });

  it("collectBlockers detecta repuesto pendiente, aprobación y control observado", () => {
    const blockers = collectBlockers(
      cleanSnapshot({
        partItems: [{ status: "PENDIENTE", requiresApproval: false }],
        budgetVersionStatus: "PENDIENTE_APROBACION",
        qualityControlPassed: false,
      })
    );
    expect(blockers).toEqual(
      expect.arrayContaining(["APROBACION_CLIENTE", "REPUESTO_PENDIENTE", "CONTROL_OBSERVADO"])
    );
    expect(prioritizeBlockers(blockers)).toBe("APROBACION_CLIENTE");
  });

  it("assertTransitionNotBlocked aborta EN_REPARACION con bloqueadores activos", () => {
    expect(() => assertTransitionNotBlocked("EN_REPARACION", ["REPUESTO_PENDIENTE"])).toThrow(
      DomainConflictException
    );
  });

  it("permite transiciones sin bloqueadores bloqueantes", () => {
    expect(() => assertTransitionNotBlocked("EN_REPARACION", [])).not.toThrow();
    expect(() => assertTransitionNotBlocked("CONTROL", ["CONTROL_OBSERVADO"])).not.toThrow();
  });

  it("assertTransitionAllowedInTx arroja DomainConflictException con snapshot real pendiente", async () => {
    const tx = buildBlockerTxMock({
      partItems: [{ status: "PENDIENTE", requiresApproval: false }],
      budgetStatus: "APROBADO",
    });

    await expect(
      assertTransitionAllowedInTx(tx, { workshopId: "ws_1", workOrderId: "wo_1", targetStatus: "EN_REPARACION" })
    ).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "BLOCKED_TRANSITION",
      details: { blockers: ["REPUESTO_PENDIENTE"] },
    });
  });

  it("assertTransitionAllowedInTx resuelve cuando no hay bloqueadores", async () => {
    const tx = buildBlockerTxMock({ partItems: [], budgetStatus: "APROBADO" });

    const result = await assertTransitionAllowedInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      targetStatus: "EN_REPARACION",
    });

    expect(result.blockers).toEqual([]);
    expect(result.primary).toBe("NINGUNO");
  });

  it("recalculateBlockersInTx persiste todas las columnas NOT NULL (workshopId, type, blockedByUserId)", async () => {
    const tx = buildBlockerTxMock({
      partItems: [{ status: "PENDIENTE", requiresApproval: false }],
      budgetStatus: "APROBADO",
    });

    const primary = await recalculateBlockersInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      actorAdminId: "au_operator",
    });

    expect(primary).toBe("REPUESTO_PENDIENTE");
    expect(tx.orderBlocker.create).toHaveBeenCalledWith({
      data: {
        workshopId: "ws_1",
        workOrderId: "wo_1",
        type: "REPUESTO_PENDIENTE",
        reason: "REPUESTO_PENDIENTE",
        isActive: true,
        blockedByUserId: "au_operator",
      },
    });
  });

  it("recalculateBlockersInTx resuelve bloqueadores que ya no están activos", async () => {
    const tx = buildBlockerTxMock({ partItems: [], budgetStatus: "APROBADO" });
    vi.mocked(tx.orderBlocker.findMany).mockResolvedValueOnce([
      { reason: "REPUESTO_PENDIENTE" },
    ]);

    const primary = await recalculateBlockersInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
      actorAdminId: "au_operator",
    });

    expect(primary).toBe("NINGUNO");
    expect(tx.orderBlocker.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: "wo_1", reason: { in: ["REPUESTO_PENDIENTE"] }, isActive: true },
        data: expect.objectContaining({
          isActive: false,
          resolvedByUserId: "au_operator",
        }),
      })
    );
  });

  it("recalculateBlockersInTx resuelve blockedByUserId desde workOrder.createdById cuando no hay actorAdminId", async () => {
    const tx = buildBlockerTxMock({
      partItems: [{ status: "PENDIENTE", requiresApproval: false }],
      budgetStatus: "APROBADO",
    });
    vi.mocked(tx.workOrder.findFirst).mockResolvedValueOnce({
      id: "wo_1",
      status: "ESPERANDO_REPARACION",
      createdById: "au_creator",
    });

    await recalculateBlockersInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
    });

    expect(tx.orderBlocker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blockedByUserId: "au_creator",
        }),
      })
    );
  });

  it("recalculateBlockersInTx resuelve blockedByUserId desde adminUser activo cuando createdById es null", async () => {
    const tx = buildBlockerTxMock({
      partItems: [{ status: "PENDIENTE", requiresApproval: false }],
      budgetStatus: "APROBADO",
    });
    vi.mocked(tx.workOrder.findFirst).mockResolvedValueOnce({
      id: "wo_1",
      status: "ESPERANDO_REPARACION",
      createdById: null,
    });
    tx.adminUser = {
      findFirst: vi.fn().mockResolvedValue({ id: "au_workshop_owner" }),
    };

    await recalculateBlockersInTx(tx, {
      workshopId: "ws_1",
      workOrderId: "wo_1",
    });

    expect(tx.orderBlocker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blockedByUserId: "au_workshop_owner",
        }),
      })
    );
  });

  it("recalculateBlockersInTx arroja DomainConflictException cuando no existe ningún admin en el taller", async () => {
    const tx = buildBlockerTxMock({
      partItems: [{ status: "PENDIENTE", requiresApproval: false }],
      budgetStatus: "APROBADO",
    });
    vi.mocked(tx.workOrder.findFirst).mockResolvedValueOnce({
      id: "wo_1",
      status: "ESPERANDO_REPARACION",
      createdById: null,
    });
    tx.adminUser = {
      findFirst: vi.fn().mockResolvedValue(null),
    };

    await expect(
      recalculateBlockersInTx(tx, {
        workshopId: "ws_1",
        workOrderId: "wo_1",
      })
    ).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "NO_ADMIN_ACTOR_AVAILABLE",
    });
  });
});
