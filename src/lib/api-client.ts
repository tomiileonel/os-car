/**
 * api-client — typed fetch wrapper enforcing the canonical OS-CAR
 * response envelope and unconditional x-correlation-id propagation.
 *
 * Design decisions:
 * - ApiClientError carries both the HTTP status (for UI branching on
 *   400/403/409/etc.) and the envelope's business `code`/`details`
 *   (for message + telemetry). Collapsing to only one loses information
 *   the caller needs — a 409 with code VEHICLE_DUPLICATE_PLATE reads
 *   differently from a 409 idempotency-key conflict.
 * - Every request gets a fresh x-correlation-id via crypto.randomUUID()
 *   unless the caller explicitly supplies one (e.g. to correlate a
 *   retry with the original attempt). This is unconditional: it is set
 *   before any other headers merge, and callers cannot accidentally
 *   omit it.
 * - AbortSignal is a first-class parameter, not bolted on, so debounced
 *   search call sites can cancel stale requests without wrapping fetch
 *   themselves.
 * - No `any`: unknown JSON is narrowed through a runtime shape check
 *   before being treated as ApiSuccess<T> | ApiError.
 */

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: { requestId: string; page?: number; limit?: number; total?: number };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: { requestId: string };
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/**
 * Thrown for both transport failures (network/abort) and envelope-level
 * business errors (success: false). `status` is 0 for transport-layer
 * failures where no HTTP response was received.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly cause?: unknown;

  constructor(params: {
    message: string;
    status: number;
    code: string;
    details?: unknown;
    requestId: string | null;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
    this.cause = params.cause;
  }

  get isAbort(): boolean {
    return this.code === "REQUEST_ABORTED";
  }

  get isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR";
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
  correlationId?: string;
  headers?: Record<string, string>;
}

function createCorrelationId(): string {
  // crypto.randomUUID is available in browsers and Node 19+; both are
  // in scope for this app's supported runtimes (Node 20+ LTS per STACK.md).
  return crypto.randomUUID();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows an unknown parsed JSON body to ApiEnvelope<T> shape without
 * validating T's internal structure (callers own that contract via
 * the generic; this only checks the envelope discriminant + meta).
 */
function parseEnvelope<T>(json: unknown): ApiEnvelope<T> | null {
  if (!isPlainObject(json)) return null;
  if (typeof json.success !== "boolean") return null;

  if (json.success === true) {
    if (!isPlainObject(json.meta) || typeof json.meta.requestId !== "string") {
      return null;
    }
    if (!("data" in json)) return null;
    return json as unknown as ApiSuccessEnvelope<T>;
  }

  if (
    isPlainObject(json.error) &&
    typeof json.error.code === "string" &&
    typeof json.error.message === "string" &&
    isPlainObject(json.meta) &&
    typeof json.meta.requestId === "string"
  ) {
    return json as unknown as ApiErrorEnvelope;
  }

  return null;
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: ApiRequestOptions = {},
): Promise<T> {
  const correlationId = options.correlationId ?? createCorrelationId();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
    // Set last: x-correlation-id propagation is unconditional and must
    // not be overridable by a caller-supplied headers bag that happens
    // to also set it to something else.
    "x-correlation-id": correlationId,
  };

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      signal: options.signal ?? null,
    });
  } catch (cause) {
    const isAbort = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiClientError({
      message: isAbort ? "Request was aborted" : "Network request failed",
      status: 0,
      code: isAbort ? "REQUEST_ABORTED" : "NETWORK_ERROR",
      requestId: correlationId,
      cause,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new ApiClientError({
      message: "Response body was not valid JSON",
      status: response.status,
      code: "INVALID_RESPONSE_BODY",
      requestId: response.headers.get("x-correlation-id") ?? correlationId,
      cause,
    });
  }

  const envelope = parseEnvelope<T>(json);
  if (envelope === null) {
    throw new ApiClientError({
      message: "Response did not match the canonical API envelope",
      status: response.status,
      code: "MALFORMED_ENVELOPE",
      details: json,
      requestId: response.headers.get("x-correlation-id") ?? correlationId,
    });
  }

  if (envelope.success === false) {
    throw new ApiClientError({
      message: envelope.error.message,
      status: response.status,
      code: envelope.error.code,
      details: envelope.error.details,
      requestId: envelope.meta.requestId,
    });
  }

  return envelope.data;
}

// ---- Domain-scoped surface -------------------------------------------

export interface VehicleDto {
  id: string;
  licensePlateNormalized: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  customerId: string;
}

export interface CreateVehicleInput {
  customerName: string;
  phone: string;
  licensePlate: string;
  vin?: string;
  make?: string;
  model?: string;
  modelYear?: number;
  customerComplaint: string;
  odometerAtIntake: number;
  fuelLevel: "VACIO" | "CUARTO" | "MITAD" | "TRES_CUARTOS" | "LLENO";
}

export interface ListVehiclesParams {
  search?: string;
}

export const vehiclesApi = {
  list(params: ListVehiclesParams = {}, options?: ApiRequestOptions): Promise<VehicleDto[]> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<VehicleDto[]>(
      `/api/vehicles${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      options,
    );
  },

  create(input: CreateVehicleInput, options?: ApiRequestOptions): Promise<VehicleDto> {
    return request<VehicleDto>(
      "/api/vehicles",
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  },
};

// ---- WorkBoard & Order Sheet Surface (Gate G7) -----------------------

export type OrderStatus =
  | "INGRESADO"
  | "DIAGNOSTICO"
  | "ESPERANDO_REPARACION"
  | "EN_REPARACION"
  | "CONTROL"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADA";

export interface BayAssignmentDto {
  id: string;
  bayId: string;
  workOrderId: string;
  assignedAt: string;
  releasedAt: string | null;
  workOrder?: WorkOrderSummaryDto;
}

export interface BayDto {
  id: string;
  code: string;
  ordinal: number;
  status: "LIBRE" | "OCUPADA";
  isEnabled: boolean;
  activeAssignment?: BayAssignmentDto | null;
}

export interface WorkOrderSummaryDto {
  id: string;
  status: OrderStatus;
  version: number;
  openedAt: string;
  trackingCodeHash: string;
  customerName: string;
  customerPhone?: string;
  vehiclePlate: string;
  vehicleLabel: string;
  mechanicName?: string | null;
  bayCode?: string | null;
  totalEstimated: number;
  activeBlockersCount: number;
  completedTasksCount?: number;
  totalTasksCount?: number;
}

export interface WorkItemDto {
  id: string;
  description: string;
  estimatedMinutes: number;
  actualMinutes: number;
  hourlyRateCharged: number;
  status: string;
  isAdditional: boolean;
}

export interface PartItemDto {
  id: string;
  partNumber: string | null;
  description: string;
  quantity: number;
  unitPriceCharged: number;
  status: string;
  isAdditional: boolean;
}

export interface OrderBlockerDto {
  id: string;
  type: string;
  reason: string;
  isActive: boolean;
  blockedAt: string;
}

export interface BudgetVersionDto {
  id: string;
  versionNumber: number;
  status: "BORRADOR" | "PENDIENTE_APROBACION" | "APROBADO" | "RECHAZADO" | "SUPERSEDED";
  totalEstimated: number;
}

export interface WorkOrderDetailDto {
  id: string;
  status: OrderStatus;
  version: number;
  openedAt: string;
  diagnosedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  trackingCodeHash: string;
  vehicle: {
    id: string;
    licensePlateNormalized: string;
    vin: string | null;
    make: string | null;
    model: string | null;
    modelYear: number | null;
    color: string | null;
  };
  customer: {
    id: string;
    fullName: string;
    phone: string;
  };
  intakeRecord?: {
    odometerAtIntake: number;
    fuelLevel: string;
    customerComplaint: string;
  } | null;
  assignedMechanic?: {
    id: string;
    name: string;
    role?: string;
  } | null;
  currentBay?: {
    id: string;
    code: string;
  } | null;
  workItems: WorkItemDto[];
  partItems: PartItemDto[];
  blockers: OrderBlockerDto[];
  budget?: {
    id: string;
    currentVersion?: BudgetVersionDto | null;
  } | null;
}

export interface TransitionWorkOrderInput {
  targetStatus: OrderStatus;
  expectedVersion?: number;
  reason?: string;
}

export interface AddWorkItemInput {
  description: string;
  estimatedMinutes: number;
  hourlyRateCharged: number;
}

export interface AddPartItemInput {
  description: string;
  quantity: number;
  unitPriceCharged: number;
  partNumber?: string;
}

export interface DeliverOrderInput {
  odometerAtDelivery: number;
  deliveredToName: string;
  paymentMethod?: string;
  notes?: string;
  expectedVersion?: number;
  supervisorOverrideId?: string;
  supervisorNotes?: string;
}

export const baysApi = {
  list(options?: ApiRequestOptions): Promise<BayDto[]> {
    return request<BayDto[]>("/api/bays", { method: "GET" }, options);
  },
};

export const workOrdersApi = {
  list(
    params: { status?: OrderStatus; search?: string } = {},
    options?: ApiRequestOptions,
  ): Promise<WorkOrderSummaryDto[]> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<WorkOrderSummaryDto[]>(
      `/api/work-orders${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      options,
    );
  },

  get(id: string, options?: ApiRequestOptions): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(`/api/work-orders/${id}`, { method: "GET" }, options);
  },

  transitionStatus(
    id: string,
    input: TransitionWorkOrderInput,
    options?: ApiRequestOptions,
  ): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "transition", ...input }),
      },
      options,
    );
  },

  addWorkItem(
    id: string,
    input: AddWorkItemInput,
    options?: ApiRequestOptions,
  ): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "add-work-item", ...input }),
      },
      options,
    );
  },

  addPartItem(
    id: string,
    input: AddPartItemInput,
    options?: ApiRequestOptions,
  ): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "add-part-item", ...input }),
      },
      options,
    );
  },

  resolveBlocker(
    id: string,
    blockerId: string,
    notes?: string,
    options?: ApiRequestOptions,
  ): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "resolve-blocker", blockerId, notes }),
      },
      options,
    );
  },

  approveBudget(
    id: string,
    budgetVersionId: string,
    options?: ApiRequestOptions,
  ): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "approve-budget", budgetVersionId }),
      },
      options,
    );
  },

  rotateTrackingToken(
    id: string,
    options?: ApiRequestOptions,
  ): Promise<{ trackingToken: string; trackingUrl: string }> {
    return request<{ trackingToken: string; trackingUrl: string }>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "rotate-tracking-token" }),
      },
      options,
    );
  },

  deliver(
    id: string,
    input: DeliverOrderInput,
    options?: ApiRequestOptions,
  ): Promise<WorkOrderDetailDto> {
    return request<WorkOrderDetailDto>(
      `/api/work-orders/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ action: "deliver", ...input }),
      },
      options,
    );
  },
};

// ---- Inventory & Tire Hotel Surface (Gate G8) ------------------------

export type InventoryMovementType =
  | "INGRESO"
  | "RESERVA"
  | "CONSUMO"
  | "DEVOLUCION"
  | "AJUSTE";

export interface InventoryItemDto {
  id: string;
  sku: string;
  description: string;
  category: string | null;
  location: string | null;
  unitCost: number | null;
  unitPrice?: number;
  stockQuantity: number;
  reorderPoint: number;
  active: boolean;
  status: "NORMAL" | "BAJO" | "CRITICO" | "AGOTADO";
}

export interface RecordInventoryMovementInput {
  inventoryItemId: string;
  movementType: InventoryMovementType | "INFLOW" | "OUTFLOW" | "OT_IMPUTATION" | "ADJUSTMENT";
  quantity: number;
  note?: string;
  workOrderId?: string;
}

export interface CreateInventoryItemInput {
  sku: string;
  description: string;
  category?: string;
  location?: string;
  stockQuantity?: number;
  reorderPoint?: number;
  unitCost?: number;
}

export const inventoryApi = {
  list(
    params: { search?: string; category?: string; critical?: boolean } = {},
    options?: ApiRequestOptions,
  ): Promise<InventoryItemDto[]> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.category) query.set("category", params.category);
    if (params.critical) query.set("critical", "true");
    const qs = query.toString();
    return request<InventoryItemDto[]>(
      `/api/inventory${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      options,
    );
  },

  recordMovement(
    input: RecordInventoryMovementInput,
    options?: ApiRequestOptions,
  ): Promise<{ movement: unknown; updatedItem: InventoryItemDto }> {
    return request<{ movement: unknown; updatedItem: InventoryItemDto }>(
      "/api/inventory",
      { method: "POST", body: JSON.stringify({ action: "movement", ...input }) },
      options,
    );
  },

  createItem(
    input: CreateInventoryItemInput,
    options?: ApiRequestOptions,
  ): Promise<InventoryItemDto> {
    return request<InventoryItemDto>(
      "/api/inventory",
      { method: "POST", body: JSON.stringify({ action: "create", ...input }) },
      options,
    );
  },
};

export type TireSetStatus = "EN_CUSTODIA" | "ENTREGADO";
export type TireSeason = "VERANO" | "INVIERNO" | "TODO_CLIMA";
export type TireCondition = "OPTIMO" | "SUGERIR_REEMPLAZO" | "CRITICO" | "DANADO";

export interface TireItemDto {
  id: string;
  wheelPosition: string;
  treadDepthMm: number;
  condition: TireCondition;
  notes?: string | null;
}

export interface TireSetDto {
  id: string;
  vehicleId: string;
  customerId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  customerName: string;
  customerPhone: string;
  brand: string;
  size: string;
  dot: string | null;
  season: TireSeason;
  status: TireSetStatus;
  rack: string;
  level: string;
  position: string;
  notes: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  deliveredTo: string | null;
  minTreadDepthMm: number;
  suggestReplacement: boolean;
  tires: TireItemDto[];
}

export interface CheckInTireSetInput {
  licensePlate?: string;
  vehiclePlate?: string;
  customerName: string;
  customerPhone?: string;
  make?: string;
  model?: string;
  brand: string;
  size: string;
  season?: TireSeason;
  dot?: string;
  rack: string;
  level?: string;
  position?: string;
  notes?: string;
  avgTreadDepthMm?: number;
  tires?: Array<{
    wheelPosition: string;
    treadDepthMm: number;
    condition?: TireCondition;
    notes?: string;
  }>;
}

export type CheckInTireInput = CheckInTireSetInput;
export type RecordMovementInput = RecordInventoryMovementInput;
export interface CheckOutTireInput {
  deliveredTo?: string;
  signatureHash?: string;
}

export const tireHotelApi = {
  list(
    params: { search?: string; status?: TireSetStatus } = {},
    options?: ApiRequestOptions,
  ): Promise<TireSetDto[]> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    const qs = query.toString();
    return request<TireSetDto[]>(
      `/api/tires${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      options,
    );
  },

  get(id: string, options?: ApiRequestOptions): Promise<TireSetDto> {
    return request<TireSetDto>(`/api/tires/${id}`, { method: "GET" }, options);
  },

  checkIn(input: CheckInTireSetInput, options?: ApiRequestOptions): Promise<TireSetDto> {
    return request<TireSetDto>(
      "/api/tires",
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  },

  checkOut(
    id: string,
    input: { deliveredTo?: string; signatureHash?: string } = {},
    options?: ApiRequestOptions,
  ): Promise<TireSetDto> {
    return request<TireSetDto>(
      `/api/tires/${id}`,
      { method: "PATCH", body: JSON.stringify({ action: "checkout", ...input }) },
      options,
    );
  },
};

// ---- Express Reception (Gate G9) -------------------------------------

export interface FastVehicleLookupDto {
  found: boolean;
  vehicle?: {
    id: string;
    licensePlate: string;
    licensePlateNormalized: string;
    vehicleType?: string;
    make?: string | null;
    model?: string | null;
    modelYear?: number | null;
    color?: string | null;
    vin?: string | null;
  } | null;
  customer?: {
    id: string;
    fullName: string;
    phoneE164: string;
    email?: string | null;
    document?: string | null;
  } | null;
  history?: {
    previousOrdersCount: number;
    lastServiceDate: string | null;
    lastServiceComplaint: string | null;
    lastOdometer: number | null;
  } | null;
  activeOrder?: {
    id: string;
    status: string;
  } | null;
}

export type ReceptionDamageType = "RAYON" | "ABOLLADURA" | "ROTURA" | "CRISTAL" | "OTRO";

export interface ReceptionDamageItemInput {
  zone: string;
  damageType: ReceptionDamageType;
  xPercent?: number;
  yPercent?: number;
  note?: string | null;
}

export interface ReceptionCheckInInput {
  licensePlate: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string | null;
  customerEmail?: string | null;
  vehicleType?: "AUTO" | "CAMIONETA" | "CAMION";
  make?: string | null;
  model?: string | null;
  modelYear?: number | null;
  color?: string | null;
  vin?: string | null;
  odometerIn?: number;
  mileageIn?: number;
  fuelLevel: "VACIO" | "CUARTO" | "MITAD" | "TRES_CUARTOS" | "LLENO";
  customerComplaint: string;
  intakeNotes?: string | null;
  damages?: ReceptionDamageItemInput[];
  bayId?: string | null;
  signature?: string | null;
  signatureHash?: string | null;
  declaredBelongings?: boolean;
}

export interface ReceptionSummaryDto {
  workOrderId: string;
  workOrderNumber: string;
  trackingToken: string;
  trackingUrl: string;
  status: "INGRESADO";
  vehicleId: string;
  customerId: string;
  customerName: string;
  licensePlate: string;
  odometerIn: number;
  fuelLevel: string;
  assignedBay?: { id: string; code: string } | null;
  createdAt: string;
}

export const receptionApi = {
  lookupPlate(plate: string, options?: ApiRequestOptions): Promise<FastVehicleLookupDto> {
    const encoded = encodeURIComponent(plate.trim().toUpperCase());
    return request<FastVehicleLookupDto>(
      `/api/reception?plate=${encoded}`,
      { method: "GET" },
      options,
    );
  },

  registerReception(
    input: ReceptionCheckInInput,
    options?: ApiRequestOptions,
  ): Promise<ReceptionSummaryDto> {
    return request<ReceptionSummaryDto>(
      "/api/reception",
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  },
};

// ---- Public Tracking & Budget Decision (Gate G10) -------------------

export interface PublicTrackingVehicleDto {
  make: string | null;
  model: string | null;
  modelYear: number | null;
  licensePlateMasked: string;
  color?: string | null;
}

export interface PublicTrackingWorkshopDto {
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
}

export interface PublicTrackingDamageDto {
  id: string;
  zone: string;
  damageType: string;
  xPercent: number;
  yPercent: number;
  note?: string | null;
}

export interface PublicTrackingReceptionDto {
  odometer: number;
  fuelLevel: string;
  customerComplaint: string;
  declaredBelongings: boolean;
  damages: PublicTrackingDamageDto[];
}

export interface PublicTrackingTimelineStepDto {
  status: string;
  title: string;
  description: string;
  date?: string | null;
  completed: boolean;
  current: boolean;
}

export interface PublicTrackingLaborLineDto {
  id: string;
  description: string;
  estimatedMinutes: number;
  hourlyRateCharged: number;
  lineTotal: number;
  approved: boolean;
}

export interface PublicTrackingPartLineDto {
  id: string;
  description: string;
  quantity: number;
  unitPriceCharged: number;
  lineTotal: number;
  approved: boolean;
}

export interface PublicTrackingBudgetDto {
  id: string;
  versionNumber: number;
  status: string;
  totalEstimated: number;
  laborSubtotal: number;
  partsSubtotal: number;
  laborLines: PublicTrackingLaborLineDto[];
  partLines: PublicTrackingPartLineDto[];
}

export interface PublicTrackingDto {
  workOrderId: string;
  workOrderNumber: string;
  status: string;
  openedAt: string;
  estimatedCompletionDate?: string | null;
  vehicle: PublicTrackingVehicleDto;
  workshop: PublicTrackingWorkshopDto;
  reception?: PublicTrackingReceptionDto | null;
  timeline: PublicTrackingTimelineStepDto[];
  budget?: PublicTrackingBudgetDto | null;
}

export interface BudgetDecisionInput {
  decision?: "APROBADO" | "RECHAZADO";
  approvedItemIds?: string[];
  rejectedItemIds?: string[];
  notes?: string;
  customerSignature?: string;
}

export interface BudgetDecisionResultDto {
  workOrderId: string;
  budgetVersionId: string;
  decision: "APROBADO" | "RECHAZADO";
  newStatus: string;
  totalApprovedAmount: number;
  approvedItemsCount: number;
  rejectedItemsCount: number;
  decidedAt: string;
  message: string;
}

export const trackingApi = {
  getPublicStatus(token: string, options?: ApiRequestOptions): Promise<PublicTrackingDto> {
    const encoded = encodeURIComponent(token.trim());
    return request<PublicTrackingDto>(
      `/api/tracking/${encoded}`,
      { method: "GET" },
      options,
    );
  },

  submitBudgetDecision(
    token: string,
    input: BudgetDecisionInput,
    options?: ApiRequestOptions,
  ): Promise<BudgetDecisionResultDto> {
    const encoded = encodeURIComponent(token.trim());
    return request<BudgetDecisionResultDto>(
      `/api/tracking/${encoded}/approve`,
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  },
};

export type TelemetryPeriod = "today" | "week" | "month" | "quarter";

export interface WorkshopTelemetryDto {
  workshopId: string;
  period: TelemetryPeriod;
  startDate: string;
  endDate: string;
  cycleTimes: {
    avgLeadTimeHours: number;
    avgLeadTimeDays: number;
    avgRepairTimeHours: number;
    avgDiagnosisTimeHours: number;
    deliveredOrdersCount: number;
  };
  bays: {
    totalBays: number;
    enabledBays: number;
    occupiedBays: number;
    freeBays: number;
    utilizationRate: number;
    bays: Array<{
      id: string;
      code: string;
      ordinal: number;
      status: "LIBRE" | "OCUPADA";
      isEnabled: boolean;
      activeWorkOrder?: {
        id: string;
        licensePlate: string;
        vehicleModel: string;
        status: string;
      };
    }>;
  };
  budgets: {
    totalBudgets: number;
    approvedBudgets: number;
    rejectedBudgets: number;
    pendingBudgets: number;
    approvalRate: number;
    laborLinesCount: number;
    laborLinesApprovedCount: number;
    partLinesCount: number;
    partLinesApprovedCount: number;
    lineApprovalRate: number;
    totalEstimatedAmount: number;
    totalApprovedAmount: number;
  };
  fsmDistribution: {
    INGRESADO: number;
    DIAGNOSTICO: number;
    ESPERANDO_REPARACION: number;
    EN_REPARACION: number;
    CONTROL: number;
    LISTO: number;
    ENTREGADO: number;
    CANCELADA: number;
    totalActive: number;
    totalInPeriod: number;
  };
  financials: {
    deliveredRevenue: number;
    workInProgressEstimated: number;
    totalRevenue: number;
  };
  bottlenecks: Array<{
    status: string;
    count: number;
    oldestPendingHours: number;
  }>;
}

export const telemetryApi = {
  getReport(
    period: TelemetryPeriod = "month",
    options?: ApiRequestOptions,
  ): Promise<WorkshopTelemetryDto> {
    return request<WorkshopTelemetryDto>(
      `/api/admin/telemetry?period=${encodeURIComponent(period)}`,
      { method: "GET" },
      options,
    );
  },
};

export const __internal = { parseEnvelope, createCorrelationId };



