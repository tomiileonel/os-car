import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const orderStatusSchema = z.enum([
  "INGRESADO",
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
  "LISTO",
  "ENTREGADO",
  "CANCELADA",
]);

export const orderTransitionTargetSchema = z.enum([
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
  "LISTO",
  "ENTREGADO",
  "CANCELADA",
]);

export const fuelLevelSchema = z.enum([
  "VACIO",
  "CUARTO",
  "MITAD",
  "TRES_CUARTOS",
  "LLENO",
]);

const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();
const positiveMoney = z.number().finite().nonnegative();

export const createWorkOrderSchema = z
  .object({
    workshopId: z.string().cuid(),
    customerId: z.string().cuid(),
    vehicleId: z.string().cuid(),
    customerComplaint: z.string().trim().min(5).max(2000),
    odometerAtIntake: nonNegativeInteger,
    fuelLevel: fuelLevelSchema,
    intakeNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const transitionOrderSchema = z
  .object({
    workOrderId: z.string().cuid(),
    workshopId: z.string().cuid().optional(),
    expectedVersion: positiveInteger,
    targetStatus: orderStatusSchema,
    reason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.targetStatus === "CANCELADA" && !value.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "CANCELLATION_REASON_REQUIRED",
      });
    }
  });

export const assignBaySchema = z
  .object({
    workOrderId: z.string().cuid(),
    workshopId: z.string().cuid(),
    bayId: z.string().cuid().nullable(),
    expectedOrderVersion: positiveInteger,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const addWorkItemSchema = z
  .object({
    workOrderId: z.string().cuid(),
    workshopId: z.string().cuid(),
    description: z.string().trim().min(3).max(500),
    internalNote: z.string().trim().max(2000).optional(),
    estimatedMinutes: positiveInteger,
    hourlyRateCharged: positiveMoney,
    internalCostAmount: positiveMoney.optional(),
    assignedAdminId: z.string().cuid().nullable().optional(),
    isAdditional: z.boolean().default(false),
  })
  .strict();

export const addPartItemSchema = z
  .object({
    workOrderId: z.string().cuid(),
    workshopId: z.string().cuid(),
    inventoryItemId: z.string().cuid().nullable().optional(),
    partNumber: z.string().trim().max(80).optional(),
    description: z.string().trim().min(2).max(500),
    quantity: positiveInteger,
    unitCost: positiveMoney.nullable().optional(),
    unitPriceCharged: positiveMoney,
    isAdditional: z.boolean().default(false),
  })
  .strict();

export const orderListQuerySchema = paginationQuerySchema
  .extend({
    status: orderStatusSchema.optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict();

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderTransitionTarget = z.infer<typeof orderTransitionTargetSchema>;
export type FuelLevel = z.infer<typeof fuelLevelSchema>;
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;
export type AssignBayInput = z.infer<typeof assignBaySchema>;
export type AddWorkItemInput = z.infer<typeof addWorkItemSchema>;
export type AddPartItemInput = z.infer<typeof addPartItemSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
