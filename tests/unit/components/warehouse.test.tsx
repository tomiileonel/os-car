// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AlmacenPage from "@/../app/admin/almacen/page";
import { inventoryApi } from "@/lib/api-client";
import type { InventoryItemDto } from "@/lib/api-client";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    inventoryApi: {
      list: vi.fn(),
      recordMovement: vi.fn(),
      createItem: vi.fn(),
    },
  };
});

const MOCK_ITEMS: InventoryItemDto[] = [
  {
    id: "item-1",
    sku: "FRAM-PH5949",
    description: "Filtro de Aceite Fram Blindado",
    category: "Filtros",
    location: "Estante B-2",
    stockQuantity: 2,
    reorderPoint: 5,
    unitCost: 8500,
    active: true,
    status: "CRITICO",
  },
  {
    id: "item-2",
    sku: "MOTUL-8100-5W40",
    description: "Aceite Sintético Motul 8100 X-cess 5W40",
    category: "Lubricantes",
    location: "Pallet L-01",
    stockQuantity: 8,
    reorderPoint: 4,
    unitCost: 45000,
    active: true,
    status: "NORMAL",
  },
  {
    id: "item-3",
    sku: "FRAS-LE-PD62",
    description: "Pastillas Delanteras Fras-le",
    category: "Frenos",
    location: "Estante F-1",
    stockQuantity: 1,
    reorderPoint: 3,
    unitCost: 28000,
    active: true,
    status: "CRITICO",
  },
];

describe("AlmacenPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(inventoryApi.list).mockResolvedValue(MOCK_ITEMS);
  });

  it("renders Bento telemetry metrics and inventory items correctly", async () => {
    render(<AlmacenPage />);

    expect(screen.getByText("Cargando catálogo de inventario...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("FRAM-PH5949")).toBeInTheDocument();
      expect(screen.getByText("MOTUL-8100-5W40")).toBeInTheDocument();
      expect(screen.getByText("FRAS-LE-PD62")).toBeInTheDocument();
    });

    // Telemetría Bento
    expect(screen.getByText("3")).toBeInTheDocument(); // total SKUs
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1); // ítems críticos y stock
  });

  it("filters items by live text search input", async () => {
    const user = userEvent.setup();
    render(<AlmacenPage />);

    await waitFor(() => {
      expect(screen.getByText("FRAM-PH5949")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/buscar por sku/i);
    await user.type(searchInput, "Motul");

    expect(screen.getByText("MOTUL-8100-5W40")).toBeInTheDocument();
    expect(screen.queryByText("FRAM-PH5949")).not.toBeInTheDocument();
    expect(screen.queryByText("FRAS-LE-PD62")).not.toBeInTheDocument();
  });

  it("filters items by category chips", async () => {
    const user = userEvent.setup();
    render(<AlmacenPage />);

    await waitFor(() => {
      expect(screen.getByText("FRAM-PH5949")).toBeInTheDocument();
    });

    // Filtro por Frenos
    const frenosButton = screen.getByRole("button", { name: /^frenos$/i });
    await user.click(frenosButton);

    expect(screen.getByText("FRAS-LE-PD62")).toBeInTheDocument();
    expect(screen.queryByText("FRAM-PH5949")).not.toBeInTheDocument();
    expect(screen.queryByText("MOTUL-8100-5W40")).not.toBeInTheDocument();
  });

  it("adjusts stock by incrementing (+1) with optimistic update and API call", async () => {
    const user = userEvent.setup();
    const updatedItem: InventoryItemDto = {
      ...MOCK_ITEMS[0],
      stockQuantity: 3,
    };
    vi.mocked(inventoryApi.recordMovement).mockResolvedValueOnce({
      movement: {},
      updatedItem,
    });

    render(<AlmacenPage />);

    await waitFor(() => {
      expect(screen.getByText("FRAM-PH5949")).toBeInTheDocument();
    });

    const incrementBtns = screen.getAllByTestId("btn-increment");
    await user.click(incrementBtns[0]);

    expect(inventoryApi.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-1",
        movementType: "INFLOW",
        quantity: 1,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/stock actualizado: fram-ph5949 ahora tiene 3 un\./i)).toBeInTheDocument();
    });
  });

  it("adjusts stock by decrementing (-1) with optimistic update and API call", async () => {
    const user = userEvent.setup();
    const updatedItem: InventoryItemDto = {
      ...MOCK_ITEMS[1],
      stockQuantity: 7,
    };
    vi.mocked(inventoryApi.recordMovement).mockResolvedValueOnce({
      movement: {},
      updatedItem,
    });

    render(<AlmacenPage />);

    await waitFor(() => {
      expect(screen.getByText("MOTUL-8100-5W40")).toBeInTheDocument();
    });

    const decrementBtns = screen.getAllByTestId("btn-decrement");
    await user.click(decrementBtns[1]); // MOTUL

    expect(inventoryApi.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-2",
        movementType: "OUTFLOW",
        quantity: 1,
      }),
    );
  });

  it("opens suggested purchase order modal and handles PO dispatch", async () => {
    const user = userEvent.setup();
    render(<AlmacenPage />);

    await waitFor(() => {
      expect(screen.getByText("FRAM-PH5949")).toBeInTheDocument();
    });

    const poTriggerBtn = screen.getByRole("button", { name: /generar orden compra sugerida/i });
    await user.click(poTriggerBtn);

    expect(screen.getByText("Orden de Compra Sugerida (Auto-PO)")).toBeInTheDocument();
    // Verifica que lista ítems críticos
    expect(screen.getAllByText("FRAM-PH5949").length).toBeGreaterThan(1);

    const emitBtn = screen.getByRole("button", { name: /emitir orden a distribuidores/i });
    await user.click(emitBtn);

    await waitFor(() => {
      expect(screen.getByText(/orden de reposición #oc-/i)).toBeInTheDocument();
    });
  });

  it("opens new SKU modal and creates item via API", async () => {
    const user = userEvent.setup();
    const createdItem: InventoryItemDto = {
      id: "item-new",
      sku: "NGK-BKR6E",
      description: "Bujía NGK V-Power Pack x4",
      category: "Encendido",
      location: "Cajón E-4",
      stockQuantity: 12,
      reorderPoint: 4,
      unitCost: 9500,
      active: true,
      status: "NORMAL",
    };
    vi.mocked(inventoryApi.createItem).mockResolvedValueOnce(createdItem);

    render(<AlmacenPage />);

    await waitFor(() => {
      expect(screen.getByText("FRAM-PH5949")).toBeInTheDocument();
    });

    const newSkuBtn = screen.getByRole("button", { name: /nuevo sku/i });
    await user.click(newSkuBtn);

    expect(screen.getByText("Registrar Nuevo SKU en Almacén")).toBeInTheDocument();

    const skuInput = screen.getByPlaceholderText(/ej: motul-8100-5w40/i);
    const descInput = screen.getByPlaceholderText(/ej: filtro de aceite fram blindado/i);

    await user.type(skuInput, "NGK-BKR6E");
    await user.type(descInput, "Bujía NGK V-Power Pack x4");

    const submitBtn = screen.getByRole("button", { name: /guardar sku/i });
    await user.click(submitBtn);

    expect(inventoryApi.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: "NGK-BKR6E",
        description: "Bujía NGK V-Power Pack x4",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/sku ngk-bkr6e creado exitosamente/i)).toBeInTheDocument();
    });
  });
});

