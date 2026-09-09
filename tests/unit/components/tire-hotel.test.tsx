// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HotelNeumaticosPage from "@/../app/admin/hotel-neumaticos/page";
import { tireHotelApi } from "@/lib/api-client";
import type { TireSetDto } from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    tireHotelApi: {
      list: vi.fn(),
      get: vi.fn(),
      checkIn: vi.fn(),
      checkOut: vi.fn(),
    },
  };
});

const MOCK_TIRE_SETS: TireSetDto[] = [
  {
    id: "ts-1",
    vehicleId: "v-1",
    customerId: "c-1",
    vehiclePlate: "AF419LK",
    vehicleLabel: "Volkswagen Amarok V6",
    customerName: "Mauricio Benítez",
    customerPhone: "+54 376 449-0129",
    brand: "Bridgestone Dueler A/T",
    size: "255/60 R18",
    dot: "DOT 3823",
    season: "VERANO",
    status: "EN_CUSTODIA",
    rack: "Rack Aéreo N-14",
    level: "Nivel 2",
    position: "Posición 14",
    notes: "Funda termocontraíble",
    checkInAt: "2026-04-12T10:00:00.000Z",
    checkOutAt: null,
    deliveredTo: null,
    minTreadDepthMm: 5.8,
    suggestReplacement: false,
    tires: [
      { id: "t-1", wheelPosition: "DELANTERO_IZQUIERDO", treadDepthMm: 5.8, condition: "OPTIMO" },
      { id: "t-2", wheelPosition: "DELANTERO_DERECHO", treadDepthMm: 5.9, condition: "OPTIMO" },
      { id: "t-3", wheelPosition: "TRASERO_IZQUIERDO", treadDepthMm: 6.0, condition: "OPTIMO" },
      { id: "t-4", wheelPosition: "TRASERO_DERECHO", treadDepthMm: 6.0, condition: "OPTIMO" },
    ],
  },
  {
    id: "ts-2",
    vehicleId: "v-2",
    customerId: "c-2",
    vehiclePlate: "AE883PO",
    vehicleLabel: "Toyota Corolla Cross",
    customerName: "Carolina Vega",
    customerPhone: "+54 376 488-7711",
    brand: "Pirelli Scorpion Verde",
    size: "215/60 R17",
    dot: "DOT 1221",
    season: "INVIERNO",
    status: "EN_CUSTODIA",
    rack: "Rack Inferior S-03",
    level: "Nivel 1",
    position: "Posición 3",
    notes: null,
    checkInAt: "2026-03-28T10:00:00.000Z",
    checkOutAt: null,
    deliveredTo: null,
    minTreadDepthMm: 1.9,
    suggestReplacement: true,
    tires: [
      { id: "t-5", wheelPosition: "DELANTERO_IZQUIERDO", treadDepthMm: 1.9, condition: "SUGERIR_REEMPLAZO" },
      { id: "t-6", wheelPosition: "DELANTERO_DERECHO", treadDepthMm: 2.0, condition: "SUGERIR_REEMPLAZO" },
      { id: "t-7", wheelPosition: "TRASERO_IZQUIERDO", treadDepthMm: 2.1, condition: "SUGERIR_REEMPLAZO" },
      { id: "t-8", wheelPosition: "TRASERO_DERECHO", treadDepthMm: 2.2, condition: "OPTIMO" },
    ],
  },
];

describe("HotelNeumaticosPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tireHotelApi.list).mockResolvedValue(MOCK_TIRE_SETS);
    // Mock window.confirm
    vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  it("renders custody capacity banner and active tire sets", async () => {
    render(<HotelNeumaticosPage />);

    expect(screen.getByText("Cargando registros de custodia...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Mauricio Benítez")).toBeInTheDocument();
      expect(screen.getByText("Carolina Vega")).toBeInTheDocument();
    });

    // Racks y medidas
    expect(screen.getByText("Rack Aéreo N-14")).toBeInTheDocument();
    expect(screen.getByText("Rack Inferior S-03")).toBeInTheDocument();
    expect(screen.getByText(/255\/60 R18/i)).toBeInTheDocument();
  });

  it("highlights critical tread wear (<= 2.0mm) with Sugerir Reemplazo badge", async () => {
    render(<HotelNeumaticosPage />);

    await waitFor(() => {
      expect(screen.getByText("Carolina Vega")).toBeInTheDocument();
    });

    expect(screen.getByText("1.9 mm")).toBeInTheDocument();
    expect(screen.getByText("Sugerir Reemplazo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /presupuestar nuevos/i })).toBeInTheDocument();
  });

  it("filters sets by search input", async () => {
    const user = userEvent.setup();
    render(<HotelNeumaticosPage />);

    await waitFor(() => {
      expect(screen.getByText("Mauricio Benítez")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/buscar por cliente, teléfono, patente/i);
    await user.type(searchInput, "Carolina");

    expect(screen.getByText("Carolina Vega")).toBeInTheDocument();
    expect(screen.queryByText("Mauricio Benítez")).not.toBeInTheDocument();
  });

  it("filters sets by Sugerir Reemplazo button", async () => {
    const user = userEvent.setup();
    render(<HotelNeumaticosPage />);

    await waitFor(() => {
      expect(screen.getByText("Mauricio Benítez")).toBeInTheDocument();
    });

    const warningFilterBtn = screen.getByRole("button", { name: /sugerir reemplazo/i });
    await user.click(warningFilterBtn);

    expect(screen.getByText("Carolina Vega")).toBeInTheDocument();
    expect(screen.queryByText("Mauricio Benítez")).not.toBeInTheDocument();
  });

  it("opens modal and submits new tire set check-in", async () => {
    const user = userEvent.setup();
    const createdSet: TireSetDto = {
      id: "ts-new",
      vehicleId: "v-new",
      customerId: "c-new",
      vehiclePlate: "AG100ZZ",
      vehicleLabel: "Ford Ranger",
      customerName: "Lucas Albornoz",
      customerPhone: "+54 376 411-2233",
      brand: "Michelin Primacy",
      size: "265/65 R17",
      dot: "DOT 0524",
      season: "VERANO",
      status: "EN_CUSTODIA",
      rack: "Rack Aéreo N-15",
      level: "Nivel 2",
      position: "Posición 15",
      notes: "Fundas plásticas",
      checkInAt: new Date().toISOString(),
      checkOutAt: null,
      deliveredTo: null,
      minTreadDepthMm: 6.2,
      suggestReplacement: false,
      tires: [],
    };
    vi.mocked(tireHotelApi.checkIn).mockResolvedValueOnce(createdSet);

    render(<HotelNeumaticosPage />);

    await waitFor(() => {
      expect(screen.getByText("Mauricio Benítez")).toBeInTheDocument();
    });

    const newSetBtn = screen.getByRole("button", { name: /ingresar nuevo juego a custodia/i });
    await user.click(newSetBtn);

    expect(screen.getByText("Ingreso de Juego a Custodia (Hotel Neumáticos)")).toBeInTheDocument();

    const plateInput = screen.getByPlaceholderText(/ej: af 419 lk/i);
    const clientInput = screen.getByPlaceholderText(/ej: mauricio benítez/i);
    const brandInput = screen.getByPlaceholderText(/ej: bridgestone/i);
    const sizeInput = screen.getByPlaceholderText(/ej: 255\/60 r18/i);

    await user.type(plateInput, "AG100ZZ");
    await user.type(clientInput, "Lucas Albornoz");
    await user.clear(brandInput);
    await user.type(brandInput, "Michelin Primacy");
    await user.clear(sizeInput);
    await user.type(sizeInput, "265/65 R17");

    const submitBtn = screen.getByRole("button", { name: /confirmar ingreso & imprimir qr/i });
    await user.click(submitBtn);

    expect(tireHotelApi.checkIn).toHaveBeenCalledWith(
      expect.objectContaining({
        licensePlate: "AG100ZZ",
        customerName: "Lucas Albornoz",
        brand: "Michelin Primacy",
        size: "265/65 R17",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/juego de neumáticos ingresado en rack aéreo n-15/i)).toBeInTheDocument();
    });
  });

  it("opens QR thermal preview modal and closes on action", async () => {
    const user = userEvent.setup();
    render(<HotelNeumaticosPage />);

    await waitFor(() => {
      expect(screen.getByText("Mauricio Benítez")).toBeInTheDocument();
    });

    const qrBtns = screen.getAllByRole("button", { name: /^qr$/i });
    await user.click(qrBtns[0]);

    expect(screen.getByText("Etiquetas Térmicas Zebra (4x)")).toBeInTheDocument();
    expect(screen.getByText("DELANTERO IZQ • 255/60 R18")).toBeInTheDocument();

    const printBtn = screen.getByRole("button", { name: /imprimir 4 etiquetas/i });
    await user.click(printBtn);

    await waitFor(() => {
      expect(screen.getByText(/enviando 4 etiquetas térmicas a impresora zebra/i)).toBeInTheDocument();
    });
  });

  it("delivers tire set via checkout and updates status", async () => {
    const user = userEvent.setup();
    const deliveredSet: TireSetDto = {
      ...MOCK_TIRE_SETS[0],
      status: "ENTREGADO",
      checkOutAt: new Date().toISOString(),
      deliveredTo: "Mauricio Benítez",
    };
    vi.mocked(tireHotelApi.checkOut).mockResolvedValueOnce(deliveredSet);

    render(<HotelNeumaticosPage />);

    await waitFor(() => {
      expect(screen.getByText("Mauricio Benítez")).toBeInTheDocument();
    });

    const deliverBtns = screen.getAllByRole("button", { name: /entregar/i });
    await user.click(deliverBtns[0]);

    expect(tireHotelApi.checkOut).toHaveBeenCalledWith("ts-1", {
      deliveredTo: "Mauricio Benítez",
    });

    await waitFor(() => {
      expect(screen.getByText(/juego entregado con éxito a mauricio benítez/i)).toBeInTheDocument();
    });
  });
});

