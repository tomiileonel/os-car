import { describe, it, expect } from "vitest";
import {
  createCustomerSchema,
  updateCustomerSchema,
  normalizePhoneForIndex,
} from "../../src/shared/schemas/customer";
import {
  createVehicleSchema,
  normalizeLicensePlate,
} from "../../src/shared/schemas/vehicle";
import {
  createWorkOrderSchema,
  transitionOrderSchema,
  assignBaySchema,
  addWorkItemSchema,
  addPartItemSchema,
} from "../../src/shared/schemas/work-order";
import {
  ValidationException,
  DomainConflictException,
} from "../../src/shared/errors";

const WS_ID = "clx1a2b3c000000000000000";
const CUST_ID = "clx1a2b3c000000000000001";
const VEH_ID = "clx1a2b3c000000000000002";
const ORDER_ID = "clx1a2b3c000000000000003";
const BAY_ID = "clx1a2b3c000000000000004";

describe("domain-contracts — errors", () => {
  it("ValidationException expone ProblemDetails con status 400", () => {
    const ex = new ValidationException(
      [{ path: ["phone"], code: "invalid", message: "bad" }],
      "/intake"
    );
    expect(ex.problem.status).toBe(400);
    expect(ex.problem.instance).toBe("/intake");
    expect(ex.problem.issues).toHaveLength(1);
  });

  it("DomainConflictException.invalidTransition construye 422 con fromStatus/toStatus", () => {
    const ex = DomainConflictException.invalidTransition(
      "ENTREGADO",
      "CONTROL",
      "terminal",
      "/work-orders/x/transitions"
    );
    expect(ex.httpStatus).toBe(422);
    expect(ex.problem.fromStatus).toBe("ENTREGADO");
    expect(ex.problem.toStatus).toBe("CONTROL");
    expect(ex.problem.instance).toBe("/work-orders/x/transitions");
  });
});

describe("domain-contracts — customer", () => {
  it("acepta teléfono E164 válido", () => {
    expect(
      createCustomerSchema.safeParse({
        workshopId: WS_ID,
        fullName: "Juan Pérez",
        phoneE164: "+5491112345678",
      }).success
    ).toBe(true);
  });

  it("rechaza teléfono sin prefijo internacional", () => {
    expect(
      createCustomerSchema.safeParse({
        workshopId: WS_ID,
        fullName: "Juan Pérez",
        phoneE164: "5491112345678",
      }).success
    ).toBe(false);
  });

  it("normalizePhoneForIndex elimina el +", () => {
    expect(normalizePhoneForIndex("+5491112345678")).toBe("5491112345678");
  });

  it("updateCustomerSchema requiere al menos un campo", () => {
    expect(
      updateCustomerSchema.safeParse({
        customerId: CUST_ID,
        workshopId: WS_ID,
      }).success
    ).toBe(false);
  });

  it("rechaza campos desconocidos (strict)", () => {
    expect(
      createCustomerSchema.safeParse({
        workshopId: WS_ID,
        fullName: "Juan",
        phoneE164: "+5491112345678",
        extra: "no",
      }).success
    ).toBe(false);
  });
});

describe("domain-contracts — vehicle", () => {
  it("normaliza patente", () => {
    expect(normalizeLicensePlate("AB 123-CD")).toBe("AB123CD");
    expect(normalizeLicensePlate("  ab-123-cd  ")).toBe("AB123CD");
  });

  it("acepta patente válida", () => {
    const r = createVehicleSchema.safeParse({
      customerId: CUST_ID,
      licensePlate: "AB 123 CD",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.licensePlate).toBe("AB123CD");
  });

  it("rechaza patente con Ñ", () => {
    expect(
      createVehicleSchema.safeParse({
        customerId: CUST_ID,
        licensePlate: "AÑ123CD",
      }).success
    ).toBe(false);
  });

  it("aplica default AUTO para vehicleType", () => {
    const r = createVehicleSchema.safeParse({
      customerId: CUST_ID,
      licensePlate: "AB123CD",
    });
    if (r.success) expect(r.data.vehicleType).toBe("AUTO");
  });

  it("acepta vehicleType CAMIONETA", () => {
    const r = createVehicleSchema.safeParse({
      customerId: CUST_ID,
      licensePlate: "AB123CD",
      vehicleType: "CAMIONETA",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza vehicleType desconocido", () => {
    expect(
      createVehicleSchema.safeParse({
        customerId: CUST_ID,
        licensePlate: "AB123CD",
        vehicleType: "MOTO",
      }).success
    ).toBe(false);
  });

  it("rechaza VIN con letra O", () => {
    expect(
      createVehicleSchema.safeParse({
        customerId: CUST_ID,
        licensePlate: "AB123CD",
        vin: "1HGCM82633O004352",
      }).success
    ).toBe(false);
  });
});

describe("domain-contracts — work-order", () => {
  it("createWorkOrderSchema acepta datos válidos", () => {
    expect(
      createWorkOrderSchema.safeParse({
        workshopId: WS_ID,
        customerId: CUST_ID,
        vehicleId: VEH_ID,
        customerComplaint: "Ruido al frenar en la rueda delantera izquierda",
        odometerAtIntake: 87500,
        fuelLevel: "MITAD",
      }).success
    ).toBe(true);
  });

  it("rechaza odómetro negativo", () => {
    expect(
      createWorkOrderSchema.safeParse({
        workshopId: WS_ID,
        customerId: CUST_ID,
        vehicleId: VEH_ID,
        customerComplaint: "Ruido al frenar",
        odometerAtIntake: -1,
        fuelLevel: "LLENO",
      }).success
    ).toBe(false);
  });

  it("transitionOrderSchema requiere reason para CANCELADA", () => {
    expect(
      transitionOrderSchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        expectedVersion: 1,
        targetStatus: "CANCELADA",
      }).success
    ).toBe(false);
  });

  it("transitionOrderSchema acepta CANCELADA con reason", () => {
    expect(
      transitionOrderSchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        expectedVersion: 1,
        targetStatus: "CANCELADA",
        reason: "Cliente no volvió a contactar tras 90 días",
      }).success
    ).toBe(true);
  });

  it("assignBaySchema acepta bayId null (liberar)", () => {
    expect(
      assignBaySchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        bayId: null,
        expectedOrderVersion: 1,
      }).success
    ).toBe(true);
  });

  it("assignBaySchema acepta bayId asignado válido", () => {
    expect(
      assignBaySchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        bayId: BAY_ID,
        expectedOrderVersion: 1,
      }).success
    ).toBe(true);
  });

  it("addWorkItemSchema rechaza minutos cero", () => {
    expect(
      addWorkItemSchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        description: "Cambio de aceite",
        estimatedMinutes: 0,
        hourlyRateCharged: 5000,
      }).success
    ).toBe(false);
  });

  it("addPartItemSchema rechaza cantidad fraccionaria", () => {
    expect(
      addPartItemSchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        description: "Filtro de aceite",
        quantity: 1.5,
        unitPriceCharged: 1500,
      }).success
    ).toBe(false);
  });

  it("addPartItemSchema acepta precio cero (bonificado)", () => {
    expect(
      addPartItemSchema.safeParse({
        workOrderId: ORDER_ID,
        workshopId: WS_ID,
        description: "Arandela de tapa",
        quantity: 2,
        unitPriceCharged: 0,
      }).success
    ).toBe(true);
  });
});
