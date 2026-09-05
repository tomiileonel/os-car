import { z } from "zod";
import { cuidSchema, moneyStringSchema, positiveIntSchema } from "./common";

export const budgetLaborLineSchema = z
  .object({
    workItemId: cuidSchema.optional(),
    description: z.string().trim().min(3).max(500),
    estimatedMinutes: positiveIntSchema,
    hourlyRateCharged: moneyStringSchema,
  })
  .strict();

export const budgetPartLineSchema = z
  .object({
    partItemId: cuidSchema.optional(),
    partNumber: z.string().trim().max(80).optional(),
    description: z.string().trim().min(2).max(500),
    quantity: positiveIntSchema,
    unitPriceCharged: moneyStringSchema,
  })
  .strict();

export const publishBudgetSchema = z
  .object({
    workOrderId: cuidSchema,
    expectedOrderVersion: z.number().int().positive(),
    laborLines: z.array(budgetLaborLineSchema).min(1),
    partLines: z.array(budgetPartLineSchema).default([]),
  })
  .strict();

export const budgetDecisionSchema = z
  .object({
    workOrderId: cuidSchema,
    budgetVersionId: cuidSchema,
    decision: z.enum(["APROBADO", "RECHAZADO"]),
    rejectionReason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "RECHAZADO" && !value.rejectionReason) {
      context.addIssue({
        code: "custom",
        path: ["rejectionReason"],
        message: "REJECTION_REASON_REQUIRED",
      });
    }
  });

export type BudgetLaborLineInput = z.infer<typeof budgetLaborLineSchema>;
export type BudgetPartLineInput = z.infer<typeof budgetPartLineSchema>;
export type PublishBudgetInput = z.infer<typeof publishBudgetSchema>;
export type BudgetDecisionInput = z.infer<typeof budgetDecisionSchema>;
