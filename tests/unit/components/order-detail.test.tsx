// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderDetailPage from "@/../app/admin/ordenes/[id]/page";
import { workOrdersApi } from "@/lib/api-client";
import type { WorkOrderDetailDto } from "@/lib/api-client";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "wo-1" }),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    workOrdersApi: {
      get: vi.fn(),
      transitionStatus: vi.fn(),
      addWorkItem: vi.fn(),
      addPartItem: vi.fn(),
      resolveBlocker: vi.fn(),
      approveBudget: vi.fn(),
      rotateTrackingToken: vi.fn(),
    },
  };
});

const MOCK_ORDER_DETAIL: WorkOrderDetailDto = {
  id: "wo-1",
  status: "EN_REPARACION",
  version: 2,
  openedAt: "2026-09-09T08:30:00.000Z",
  diagnosedAt: "2026-09-09T09:00:00.000Z",
  readyAt: null,
  deliveredAt: null,
  trackingCodeHash: "hash-tracking-wo1",
  vehicle: {
    id: "veh-1",
    licensePlateNormalized: "AG405NM",
    vin: "8AG1234567890",
    make: "Peugeot",
    model: "208",
    modelYear: 2022,
    color: "Gris Grafito",
  },
  customer: {
    id: "cust-1",
    fullName: "Juan Pérez",
    phone: "+5491155443322",
  },
  intakeRecord: {
    odometerAtIntake: 58420,
    fuelLevel: "MITAD",
    customerComplaint: "Ruido metálico en tren delantero",
  },
  assignedMechanic: {
    id: "adm-1",
    name: "Carlos M.",
    role: "MECANICO",
  },
  currentBay: {
    id: "bay-1",
    code: "B1 - ELEVADOR 1",
  },
  workItems: [
    {
      id: "wi-1",
      description: "Sustitución kit correa de distribución",
      estimatedMinutes: 180, // 3.0 h * 20.000 = 60.000
      actualMinutes: 180,
      hourlyRateCharged: 20000,
      status: "COMPLETADO",
      isAdditional: false,
    },
  ],
  partItems: [
    {
      id: "pi-1",
      partNumber: "KT-DIST-208",
      description: "Kit Distribución Gates PowerGrip",
      quantity: 1, // 1 * 40.000 = 40.000
      unitPriceCharged: 40000,
      status: "DISPONIBLE",
      isAdditional: false,
    },
  ],
  blockers: [
    {
      id: "bl-1",
      type: "REPUESTO_PENDIENTE",
      reason: "Esperando tensor alternador",
      isActive: true,
      blockedAt: "2026-09-09T10:30:00.000Z",
    },
  ],
  budget: {
    id: "bg-1",
    currentVersion: {
      id: "bv-1",
      versionNumber: 1,
      status: "PENDIENTE_APROBACION",
      totalEstimated: 121000,
    },
  },
};

describe("Ficha de Orden y Presupuesto (OrderDetailPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workOrdersApi.get).mockResolvedValue(MOCK_ORDER_DETAIL);
  });

  it("renders order identification, vehicle details and reactive financials", async () => {
    render(<OrderDetailPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/cargando ficha técnica/i);

    await waitFor(() => {
      expect(screen.getByText("AG405NM")).toBeInTheDocument();
      expect(screen.getByText(/peugeot 208 2022/i)).toBeInTheDocument();
      expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
      expect(screen.getByText("+5491155443322")).toBeInTheDocument();
      expect(screen.getByText("Carlos M.")).toBeInTheDocument();
      expect(screen.getByText("58.420 KM")).toBeInTheDocument();
      expect(screen.getByText(/ruido metálico en tren delantero/i)).toBeInTheDocument();
    });

    // Sections items
    expect(screen.getByText("Sustitución kit correa de distribución")).toBeInTheDocument();
    expect(screen.getByText("Kit Distribución Gates PowerGrip")).toBeInTheDocument();

    // Financial Ticket calculations:
    // Labor: 60.000, Parts: 40.000, Net: 100.000, IVA 21%: 21.000, Total: 121.000
    expect(screen.getByText("Subtotal Mano de Obra (1)")).toBeInTheDocument();
    expect(screen.getByText("Subtotal Repuestos (1)")).toBeInTheDocument();
    expect(screen.getByText("Subtotal Gravado (Neto)")).toBeInTheDocument();
    expect(screen.getByText("IVA (21%)")).toBeInTheDocument();
    expect(screen.getByText("TOTAL FINAL")).toBeInTheDocument();
  });

  it("handles resolving an active blocker", async () => {
    const user = userEvent.setup();
    vi.mocked(workOrdersApi.resolveBlocker).mockResolvedValue({
      ...MOCK_ORDER_DETAIL,
      blockers: [],
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/esperando tensor alternador/i)).toBeInTheDocument();
    });

    const resolveBtn = screen.getByRole("button", { name: /resolver bloqueo/i });
    await user.click(resolveBtn);

    expect(workOrdersApi.resolveBlocker).toHaveBeenCalledWith("wo-1", "bl-1", "Resuelto por el operador");
  });

  it("handles approving a budget in PENDIENTE_APROBACION", async () => {
    const user = userEvent.setup();
    vi.mocked(workOrdersApi.approveBudget).mockResolvedValue({
      ...MOCK_ORDER_DETAIL,
      budget: {
        id: "bg-1",
        currentVersion: {
          id: "bv-1",
          versionNumber: 1,
          status: "APROBADO",
          totalEstimated: 121000,
        },
      },
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Versión #1")).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole("button", { name: /aprobar presupuesto \(staff\)/i });
    await user.click(approveBtn);

    expect(workOrdersApi.approveBudget).toHaveBeenCalledWith("wo-1", "bv-1");
  });

  it("handles state transition action", async () => {
    const user = userEvent.setup();
    vi.mocked(workOrdersApi.transitionStatus).mockResolvedValue({
      ...MOCK_ORDER_DETAIL,
      status: "CONTROL",
      version: 3,
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /pasar a control de calidad/i })).toBeInTheDocument();
    });

    const transitionBtn = screen.getByRole("button", { name: /pasar a control de calidad/i });
    await user.click(transitionBtn);

    expect(workOrdersApi.transitionStatus).toHaveBeenCalledWith("wo-1", {
      targetStatus: "CONTROL",
      expectedVersion: 2,
    });
  });

  it("rotates and copies canonical client tracking link with raw token", async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    vi.mocked(workOrdersApi.rotateTrackingToken).mockResolvedValueOnce({
      trackingToken: "fresh-raw-token",
      trackingUrl: "/tracking/fresh-raw-token",
    });

    render(<OrderDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("AG405NM")).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole("button", { name: /copiar enlace para cliente/i });
    await user.click(copyBtn);

    expect(workOrdersApi.rotateTrackingToken).toHaveBeenCalledWith("wo-1");
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/tracking/fresh-raw-token"));
    expect(await screen.findByText(/enlace público de seguimiento copiado/i)).toBeInTheDocument();
  });
});
