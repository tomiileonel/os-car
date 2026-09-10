// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecepcionPage from "@/../app/admin/recepcion/page";
import { receptionApi, baysApi } from "@/lib/api-client";
import type { FastVehicleLookupDto, ReceptionSummaryDto } from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    baysApi: {
      list: vi.fn(),
    },
    receptionApi: {
      lookupPlate: vi.fn(),
      registerReception: vi.fn(),
    },
  };
});

describe("RecepcionPage - Mostrador Rápido & Recepción Express", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(baysApi.list).mockResolvedValue([
      { id: "bay-1", code: "01", ordinal: 1, status: "LIBRE", isEnabled: true },
      { id: "bay-2", code: "02", ordinal: 2, status: "OCUPADA", isEnabled: true },
    ]);
  });

  it("renderiza todos los componentes clave del formulario de recepción express", async () => {
    render(<RecepcionPage />);

    expect(
      screen.getByText("Recepción de Vehículo • Nueva Orden de Entrada"),
    ).toBeInTheDocument();
    expect(screen.getByText("Flujo Express (60s)", { exact: false })).toBeInTheDocument();

    // Inputs principales
    expect(screen.getByLabelText(/patente/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono de contacto directo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/odómetro entrada/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/describa el fallo, indicaciones del cliente/i),
    ).toBeInTheDocument();

    // Selector de combustible
    expect(screen.getByRole("button", { name: /1\/4/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1\/2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3\/4/i })).toBeInTheDocument();

    // Inspección de daños
    expect(screen.getByText("Inspección Visual de Carrocería")).toBeInTheDocument();
    expect(screen.getByLabelText("Pad de firma digital")).toBeInTheDocument();

    // Botón principal
    expect(
      screen.getByRole("button", { name: /completar recepción y emitir comprobante/i }),
    ).toBeInTheDocument();
  });

  it("permite seleccionar distintos niveles de combustible", async () => {
    const user = userEvent.setup();
    render(<RecepcionPage />);

    const btn14 = screen.getByRole("button", { name: /1\/4/i });
    const btnFull = screen.getByRole("button", { name: /100%/i });

    // Clic en 1/4
    await user.click(btn14);
    expect(screen.getByText("1/4 (25%)")).toBeInTheDocument();

    // Clic en Full / Lleno
    await user.click(btnFull);
    expect(screen.getByText("Lleno (100%)")).toBeInTheDocument();
  });

  it("permite registrar y remover puntos de daños preexistentes", async () => {
    const user = userEvent.setup();
    render(<RecepcionPage />);

    expect(screen.getByText(/sin daños marcados/i)).toBeInTheDocument();

    // Agregar daño en Frente
    const btnFrente = screen.getByRole("button", { name: /\+ Frente \/ Ópticas/i });
    await user.click(btnFrente);

    expect(screen.getByText("Daños preexistentes constatados (1):")).toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar daño en FRENTE")).toBeInTheDocument();

    // Agregar daño en Trasera
    const btnTrasera = screen.getByRole("button", { name: /\+ Trasera \/ Baúl/i });
    await user.click(btnTrasera);

    expect(screen.getByText("Daños preexistentes constatados (2):")).toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar daño en TRASERA")).toBeInTheDocument();

    // Eliminar daño en Frente
    const btnRemove = screen.getByLabelText("Eliminar daño en FRENTE");
    await user.click(btnRemove);

    expect(screen.getByText("Daños preexistentes constatados (1):")).toBeInTheDocument();
    expect(screen.queryByLabelText("Eliminar daño en FRENTE")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar daño en TRASERA")).toBeInTheDocument();
  });

  it("agrega síntomas rápidamente mediante chips táctiles al textarea", async () => {
    const user = userEvent.setup();
    render(<RecepcionPage />);

    const textarea = screen.getByPlaceholderText(
      /describa el fallo, indicaciones del cliente/i,
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    const chipService = screen.getByRole("button", { name: /Service Oficial 80k km/i });
    await user.click(chipService);

    expect(textarea.value).toContain("Service oficial de mantenimiento programado");

    const chipEngine = screen.getByRole("button", { name: /Check Engine ON/i });
    await user.click(chipEngine);

    expect(textarea.value).toContain("Testigo Check Engine encendido");
  });

  it("busca y precarga la ficha del vehículo al ingresar patente y presionar Buscar", async () => {
    const user = userEvent.setup();

    const lookupData: FastVehicleLookupDto = {
      found: true,
      vehicle: {
        id: "veh_10",
        licensePlate: "AF123CD",
        licensePlateNormalized: "AF123CD",
        vehicleType: "AUTO",
        make: "Volkswagen",
        model: "Golf",
        modelYear: 2021,
        color: "Azul Marino",
        vin: "WVW12345",
      },
      customer: {
        id: "cus_10",
        fullName: "Roberto Sánchez",
        phoneE164: "+5491144332211",
        email: "roberto@ejemplo.com",
        document: "28.112.990",
      },
      history: {
        previousOrdersCount: 3,
        lastServiceDate: "2024-01-10T10:00:00.000Z",
        lastServiceComplaint: "Cambio de aceite y filtros",
        lastOdometer: 45000,
      },
      activeOrder: null,
    };

    vi.mocked(receptionApi.lookupPlate).mockResolvedValue(lookupData);

    render(<RecepcionPage />);

    const plateInput = screen.getByLabelText(/patente/i);
    await user.type(plateInput, "AF123CD");

    const searchBtn = screen.getByRole("button", { name: /buscar ficha/i });
    await user.click(searchBtn);

    await waitFor(() => {
      expect(receptionApi.lookupPlate).toHaveBeenCalledWith("AF123CD");
    });

    // Los datos del cliente y vehículo deben haberse precargado en el formulario
    expect(screen.getByDisplayValue("Roberto Sánchez")).toBeInTheDocument();
    expect(screen.getByDisplayValue("+5491144332211")).toBeInTheDocument();
    expect(screen.getByDisplayValue("28.112.990")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Volkswagen Golf")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Azul Marino")).toBeInTheDocument();
    expect(screen.getByText(/3 servicios previos/i)).toBeInTheDocument();
  });

  it("completa recepción con éxito y muestra el comprobante", async () => {
    const user = userEvent.setup();

    const createdOrder: ReceptionSummaryDto = {
      workOrderId: "wo_new_99",
      workOrderNumber: "OT-NEW099",
      trackingToken: "token_99_xyz",
      trackingUrl: "/seguimiento?token=token_99_xyz",
      status: "INGRESADO",
      vehicleId: "veh_99",
      customerId: "cus_99",
      customerName: "Carlos Menem",
      licensePlate: "AE123BB",
      odometerIn: 92000,
      fuelLevel: "MITAD",
      assignedBay: { id: "bay-1", code: "01" },
      createdAt: "2026-09-09T21:00:00.000Z",
    };

    vi.mocked(receptionApi.registerReception).mockResolvedValue(createdOrder);

    render(<RecepcionPage />);

    // Llenar campos requeridos
    await user.type(screen.getByLabelText(/patente/i), "AE123BB");
    await user.type(screen.getByLabelText(/nombre y apellido/i), "Carlos Menem");
    await user.type(screen.getByLabelText(/teléfono de contacto directo/i), "1155443322");
    await user.type(screen.getByLabelText(/odómetro entrada/i), "92000");

    const textarea = screen.getByPlaceholderText(/describa el fallo, indicaciones del cliente/i);
    await user.type(textarea, "Revisión general de tren delantero");

    // Seleccionar combustible 1/2
    const btn12 = screen.getByRole("button", { name: /1\/2/i });
    await user.click(btn12);

    // Seleccionar bahía 01
    const baySelect = screen.getByLabelText(/derivación directa a bahía/i);
    await user.selectOptions(baySelect, "bay-1");

    // Enviar
    const submitBtn = screen.getByRole("button", {
      name: /completar recepción y emitir comprobante/i,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(receptionApi.registerReception).toHaveBeenCalledWith(
        expect.objectContaining({
          licensePlate: "AE123BB",
          customerName: "Carlos Menem",
          customerPhone: "1155443322",
          odometerIn: 92000,
          customerComplaint: "Revisión general de tren delantero",
          fuelLevel: "MITAD",
          bayId: "bay-1",
        }),
      );
    });

    // Comprobar modal de éxito
    expect(await screen.findByText("¡Recepción Completada con Éxito!")).toBeInTheDocument();
    expect(screen.getByText("OT-NEW099")).toBeInTheDocument();
    expect(screen.getByText(/92.000 KM/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Bahía 01/i).length).toBeGreaterThanOrEqual(1);
  });
});
