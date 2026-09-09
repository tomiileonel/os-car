// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BahiasPage from "@/../app/admin/bahias/page";
import { baysApi, workOrdersApi } from "@/lib/api-client";
import type { BayDto, WorkOrderSummaryDto } from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    baysApi: {
      list: vi.fn(),
    },
    workOrdersApi: {
      list: vi.fn(),
      transitionStatus: vi.fn(),
    },
  };
});

const MOCK_BAYS: BayDto[] = [
  {
    id: "bay-1",
    code: "B1 - ELEVADOR 1",
    ordinal: 1,
    status: "OCUPADA",
    isEnabled: true,
    activeAssignment: {
      id: "as-1",
      bayId: "bay-1",
      workOrderId: "wo-1",
      assignedAt: "2026-09-09T10:00:00.000Z",
      releasedAt: null,
      workOrder: {
        id: "wo-1",
        status: "DIAGNOSTICO",
        version: 2,
        openedAt: "2026-09-09T08:30:00.000Z",
        trackingCodeHash: "hash-wo-1",
        customerName: "Juan Pérez",
        customerPhone: "+5491155443322",
        vehiclePlate: "AG405NM",
        vehicleLabel: "Peugeot 208 2022",
        mechanicName: "Carlos M.",
        bayCode: "B1 - ELEVADOR 1",
        totalEstimated: 150000,
        activeBlockersCount: 1,
        completedTasksCount: 2,
        totalTasksCount: 3,
      },
    },
  },
  {
    id: "bay-2",
    code: "B2 - ELEVADOR 2",
    ordinal: 2,
    status: "LIBRE",
    isEnabled: true,
    activeAssignment: null,
  },
];

const MOCK_ORDERS: WorkOrderSummaryDto[] = [
  MOCK_BAYS[0].activeAssignment!.workOrder!,
  {
    id: "wo-patio-1",
    status: "INGRESADO",
    version: 1,
    openedAt: "2026-09-09T09:15:00.000Z",
    trackingCodeHash: "hash-patio-1",
    customerName: "María Gonzalez",
    vehiclePlate: "AA123BB",
    vehicleLabel: "Toyota Corolla 2020",
    bayCode: null,
    totalEstimated: 0,
    activeBlockersCount: 0,
  },
];

describe("WorkBoard de Bahías (BahiasPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(baysApi.list).mockResolvedValue(MOCK_BAYS);
    vi.mocked(workOrdersApi.list).mockResolvedValue(MOCK_ORDERS);
  });

  it("renders loading state and then populates bays and telemetry", async () => {
    render(<BahiasPage />);

    expect(screen.getByRole("status")).toHaveTextContent(/cargando tablero de bahías/i);

    await waitFor(() => {
      expect(screen.getByText("B1 - ELEVADOR 1")).toBeInTheDocument();
      expect(screen.getByText("B2 - ELEVADOR 2")).toBeInTheDocument();
    });

    // Telemetry capacity: 1 of 2 bays occupied = 50%
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/capacidad \(1 \/ 2 ocupadas\)/i)).toBeInTheDocument();

    // Patio vehicles count: 1 unassigned vehicle in patio
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/vehículos en espera \/ patio/i)).toBeInTheDocument();
  });

  it("displays vehicle card details for occupied bay", async () => {
    render(<BahiasPage />);

    await waitFor(() => {
      expect(screen.getByText("Peugeot 208 2022")).toBeInTheDocument();
      expect(screen.getByText("AG405NM")).toBeInTheDocument();
      expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
      expect(screen.getByText("Carlos M.")).toBeInTheDocument();
    });

    // Checklist progress: 2 / 3
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();

    // Active blocker alert
    expect(screen.getByText(/bloqueos activos:/i)).toBeInTheDocument();

    // Link to order detail
    const detailLink = screen.getByRole("link", { name: /ver ficha & presupuesto/i });
    expect(detailLink).toHaveAttribute("href", "/admin/ordenes/wo-1");
  });

  it("triggers quick transition from DIAGNOSTICO to ESPERANDO_REPARACION", async () => {
    const user = userEvent.setup();
    vi.mocked(workOrdersApi.transitionStatus).mockResolvedValue({
      ...MOCK_BAYS[0].activeAssignment!.workOrder!,
      status: "ESPERANDO_REPARACION",
      version: 3,
      diagnosedAt: "2026-09-09T11:00:00.000Z",
      readyAt: null,
      deliveredAt: null,
      vehicle: {
        id: "veh-1",
        licensePlateNormalized: "AG405NM",
        vin: null,
        make: "Peugeot",
        model: "208",
        modelYear: 2022,
        color: null,
      },
      customer: {
        id: "cust-1",
        fullName: "Juan Pérez",
        phone: "+5491155443322",
      },
      workItems: [],
      partItems: [],
      blockers: [],
    });

    render(<BahiasPage />);

    await waitFor(() => {
      expect(screen.getByText("B1 - ELEVADOR 1")).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole("button", { name: /a espera rep\./i });
    expect(nextBtn).toBeInTheDocument();

    await user.click(nextBtn);

    expect(workOrdersApi.transitionStatus).toHaveBeenCalledWith("wo-1", {
      targetStatus: "ESPERANDO_REPARACION",
      expectedVersion: 2,
    });
  });

  it("filters bays by search input", async () => {
    const user = userEvent.setup();
    render(<BahiasPage />);

    await waitFor(() => {
      expect(screen.getByText("B1 - ELEVADOR 1")).toBeInTheDocument();
      expect(screen.getByText("B2 - ELEVADOR 2")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/buscar patente o cliente/i);
    await user.type(searchInput, "AG405NM");

    expect(screen.getByText("B1 - ELEVADOR 1")).toBeInTheDocument();
    expect(screen.queryByText("B2 - ELEVADOR 2")).not.toBeInTheDocument();
  });
});
