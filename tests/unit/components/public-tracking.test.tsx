// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PublicTrackingPage from "@/../app/tracking/[token]/page";
import { trackingApi, ApiClientError } from "@/lib/api-client";
import type { PublicTrackingDto, BudgetDecisionResultDto } from "@/lib/api-client";

let currentParams = { token: "valid-token" };
vi.mock("next/navigation", () => ({
  useParams: () => currentParams,
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    trackingApi: {
      getPublicStatus: vi.fn(),
      submitBudgetDecision: vi.fn(),
    },
  };
});

const mockTrackingData: PublicTrackingDto = {
  workOrderId: "wo-g10-001",
  workOrderNumber: "OT-2026-0042",
  status: "DIAGNOSTICO",
  openedAt: "2026-09-10T08:30:00.000Z",
  estimatedCompletionDate: "2026-09-12T18:00:00.000Z",
  vehicle: {
    make: "Ford",
    model: "Focus",
    modelYear: 2019,
    color: "Azul",
    licensePlateMasked: "AD ••• GH",
  },
  workshop: {
    name: "OS-CAR Taller Mecánico",
    address: "Flor de Ceibo 11275, Barrio Itaembé Guazú",
    phone: "+54 9 376 435-3566",
    whatsapp: "5493764353566",
  },
  reception: {
    odometer: 62450,
    fuelLevel: "MITAD",
    customerComplaint: "Vibración al frenar a más de 80 km/h y chillido",
    declaredBelongings: true,
    damages: [
      {
        id: "dmg-1",
        zone: "FRENTE",
        damageType: "RAYON",
        xPercent: 20,
        yPercent: 30,
        note: "Rayón en paragolpes delantero",
      },
    ],
  },
  timeline: [
    {
      status: "INGRESADO",
      title: "Recepción en Taller",
      description: "Vehículo recibido.",
      date: "2026-09-10T08:30:00.000Z",
      completed: true,
      current: false,
    },
    {
      status: "DIAGNOSTICO",
      title: "Diagnóstico & Presupuesto",
      description: "Revisión técnica en elevador.",
      date: "2026-09-10T09:15:00.000Z",
      completed: false,
      current: true,
    },
    {
      status: "ESPERANDO_REPARACION",
      title: "Aprobación de Presupuesto",
      description: "A la espera de autorización.",
      completed: false,
      current: false,
    },
    {
      status: "EN_REPARACION",
      title: "En Reparación Mecánica",
      description: "Trabajos mecánicos en curso.",
      completed: false,
      current: false,
    },
    {
      status: "CONTROL",
      title: "Control de Calidad",
      description: "Inspección final.",
      completed: false,
      current: false,
    },
    {
      status: "LISTO",
      title: "Vehículo Listo",
      description: "Disponible para retiro.",
      completed: false,
      current: false,
    },
  ],
  budget: {
    id: "bgt-100",
    versionNumber: 1,
    status: "PENDIENTE_APROBACION",
    totalEstimated: 120000,
    laborSubtotal: 50000,
    partsSubtotal: 70000,
    laborLines: [
      {
        id: "lbl-1",
        description: "Reemplazo de pastillas delanteras",
        estimatedMinutes: 90,
        hourlyRateCharged: 25000,
        lineTotal: 50000,
        approved: false,
      },
    ],
    partLines: [
      {
        id: "prt-1",
        description: "Pastillas de freno cerámicas",
        quantity: 1,
        unitPriceCharged: 40000,
        lineTotal: 40000,
        approved: false,
      },
      {
        id: "prt-2",
        description: "Líquido de frenos DOT4",
        quantity: 1,
        unitPriceCharged: 30000,
        lineTotal: 30000,
        approved: false,
      },
    ],
  },
};

describe("PublicTrackingPage - Portal de Seguimiento & Aprobación de Presupuesto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentParams = { token: "valid-token" };
  });

  it("muestra estado de carga y luego renderiza la información del vehículo y taller", async () => {
    vi.mocked(trackingApi.getPublicStatus).mockResolvedValueOnce(mockTrackingData);

    render(<PublicTrackingPage params={Promise.resolve({ token: "valid-token" })} />);

    // Verifica pantalla de carga inicial
    expect(screen.getByText(/cargando estado de tu vehículo/i)).toBeInTheDocument();

    // Espera a que cargue la orden
    await waitFor(() => {
      expect(screen.getByText("OT-2026-0042")).toBeInTheDocument();
    });

    expect(screen.getByText("Ford Focus")).toBeInTheDocument();
    expect(screen.getByText("AD ••• GH")).toBeInTheDocument();
    expect(screen.getAllByText("OS-CAR Taller Mecánico").length).toBeGreaterThan(0);
    expect(screen.getByText("DIAGNOSTICO")).toBeInTheDocument();
  });

  it("renderiza la línea de tiempo completa con la etapa actual destacada", async () => {
    vi.mocked(trackingApi.getPublicStatus).mockResolvedValueOnce(mockTrackingData);

    render(<PublicTrackingPage params={Promise.resolve({ token: "valid-token" })} />);

    await waitFor(() => {
      expect(screen.getByText("Progreso del Vehículo en Taller")).toBeInTheDocument();
    });

    expect(screen.getByText("Recepción en Taller")).toBeInTheDocument();
    expect(screen.getByText("Diagnóstico & Presupuesto")).toBeInTheDocument();
    expect(screen.getByText("Aprobación de Presupuesto")).toBeInTheDocument();
    expect(screen.getByText("En Reparación Mecánica")).toBeInTheDocument();
    expect(screen.getByText("Control de Calidad")).toBeInTheDocument();
    expect(screen.getByText("Vehículo Listo")).toBeInTheDocument();
  });

  it("despliega la ficha de ingreso con odómetro, combustible y daños preexistentes", async () => {
    vi.mocked(trackingApi.getPublicStatus).mockResolvedValueOnce(mockTrackingData);

    render(<PublicTrackingPage params={Promise.resolve({ token: "valid-token" })} />);

    await waitFor(() => {
      expect(screen.getByText("Ficha de Ingreso")).toBeInTheDocument();
    });

    // Odómetro y combustible
    expect(screen.getByText("62.450 km")).toBeInTheDocument();
    expect(screen.getByText("1/2 Tanque")).toBeInTheDocument();
    expect(
      screen.getByText("Vibración al frenar a más de 80 km/h y chillido"),
    ).toBeInTheDocument();

    // Daños
    expect(screen.getByText("FRENTE")).toBeInTheDocument();
    expect(screen.getByText("RAYON")).toBeInTheDocument();
  });

  it("calcula reactivamente el subtotal y total al marcar o desmarcar ítems presupuestados", async () => {
    const user = userEvent.setup();
    vi.mocked(trackingApi.getPublicStatus).mockResolvedValueOnce(mockTrackingData);

    render(<PublicTrackingPage params={Promise.resolve({ token: "valid-token" })} />);

    await waitFor(() => {
      expect(screen.getByText("Presupuesto Técnico")).toBeInTheDocument();
    });

    // Inicialmente todos están marcados como aprobados: 50.000 + 40.000 + 30.000 = 120.000
    // Verificamos total en la barra fija
    expect(screen.getAllByText("$120.000").length).toBeGreaterThan(0);
    expect(screen.getByText("3 aprobados • 0 omitidos")).toBeInTheDocument();

    // Desmarcamos el líquido de frenos ($30.000)
    const dot4Checkbox = screen.getByLabelText("Aprobar repuesto Líquido de frenos DOT4");
    await user.click(dot4Checkbox);

    // Nuevo total: 120.000 - 30.000 = 90.000
    expect(screen.getAllByText("$90.000").length).toBeGreaterThan(0);
    expect(screen.getByText("2 aprobados • 1 omitidos")).toBeInTheDocument();

    // Desmarcamos las pastillas ($40.000)
    const pastillasCheckbox = screen.getByLabelText("Aprobar repuesto Pastillas de freno cerámicas");
    await user.click(pastillasCheckbox);

    // Nuevo total: 90.000 - 40.000 = 50.000
    expect(screen.getAllByText("$50.000").length).toBeGreaterThan(0);
    expect(screen.getByText("1 aprobados • 2 omitidos")).toBeInTheDocument();

    // Clic en Aprobar Todos restaura a $120.000
    const btnApproveAll = screen.getByRole("button", { name: /aprobar todos/i });
    await user.click(btnApproveAll);
    expect(screen.getAllByText("$120.000").length).toBeGreaterThan(0);
    expect(screen.getByText("3 aprobados • 0 omitidos")).toBeInTheDocument();
  });

  it("permite confirmar la decisión de presupuesto y muestra mensaje de confirmación", async () => {
    const user = userEvent.setup();
    vi.mocked(trackingApi.getPublicStatus).mockResolvedValue(mockTrackingData);

    const mockResult: BudgetDecisionResultDto = {
      workOrderId: "wo-g10-001",
      budgetVersionId: "bgt-100",
      decision: "APROBADO",
      newStatus: "EN_REPARACION",
      totalApprovedAmount: 90000,
      approvedItemsCount: 2,
      rejectedItemsCount: 1,
      decidedAt: "2026-09-10T12:00:00.000Z",
      message: "Presupuesto aprobado por el cliente vía portal público.",
    };

    vi.mocked(trackingApi.submitBudgetDecision).mockResolvedValueOnce(mockResult);

    render(<PublicTrackingPage params={Promise.resolve({ token: "valid-token" })} />);

    await waitFor(() => {
      expect(screen.getByText("Presupuesto Técnico")).toBeInTheDocument();
    });

    // Desmarcamos un ítem
    const dot4Checkbox = screen.getByLabelText("Aprobar repuesto Líquido de frenos DOT4");
    await user.click(dot4Checkbox);

    // Ingresamos notas opcionales
    const notesInput = screen.getByPlaceholderText(/autorizo el cambio/i);
    await user.type(notesInput, "Dejar el líquido para el próximo service.");

    // Enviamos decisión
    const confirmButton = screen.getByRole("button", { name: /confirmar decisión/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(trackingApi.submitBudgetDecision).toHaveBeenCalledWith("valid-token", {
        decision: "APROBADO",
        approvedItemIds: expect.arrayContaining(["lbl-1", "prt-1"]),
        rejectedItemIds: ["prt-2"],
        notes: "Dejar el líquido para el próximo service.",
      });
    });

    // Mensaje de confirmación
    await waitFor(() => {
      expect(screen.getByText("¡Decisión Confirmada!")).toBeInTheDocument();
      expect(
        screen.getByText("Presupuesto aprobado por el cliente vía portal público."),
      ).toBeInTheDocument();
    });
  });

  it("renderiza pantalla de error cuando el token es inválido o no existe", async () => {
    vi.mocked(trackingApi.getPublicStatus).mockRejectedValueOnce(
      new ApiClientError({
        message: "Orden no encontrada",
        status: 404,
        code: "NOT_FOUND",
        requestId: "req-err-404",
      }),
    );

    currentParams = { token: "token-inexistente" };
    render(<PublicTrackingPage params={Promise.resolve({ token: "token-inexistente" })} />);

    await waitFor(() => {
      expect(screen.getByText("Enlace de Seguimiento No Disponible")).toBeInTheDocument();
      expect(screen.getByText("Orden no encontrada")).toBeInTheDocument();
    });

    // Enlace de WhatsApp de asistencia
    expect(screen.getByText(/consultar por whatsapp/i)).toBeInTheDocument();
  });
});
