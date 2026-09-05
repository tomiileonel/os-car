import { z } from "zod";
import { cuidSchema, paginationQuerySchema } from "./common";

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

export const transitionOrderSchema = z
  .object({
    workOrderId: cuidSchema,
    expectedVersion: z.number().int().positive(),
    targetStatus: orderTransitionTargetSchema,
    reason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.targetStatus === "CANCELADA" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "CANCELLATION_REASON_REQUIRED",
      });
    }
  });

export const orderListQuerySchema = paginationQuerySchema
  .extend({
    status: orderStatusSchema.optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict();

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderTransitionTarget = z.infer<typeof orderTransitionTargetSchema>;
export type TransitionOrderInput = z.infer<typeof transitionOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
