import { z } from "zod";
import { cuidSchema, nonNegativeIntSchema } from "./common";

export const deliverySchema = z
  .object({
    workOrderId: cuidSchema,
    expectedVersion: z.number().int().positive(),
    recipientName: z.string().trim().min(2).max(120),
    recipientDocumentLast4: z.string().regex(/^[0-9]{4}$/, "DOCUMENT_LAST4_INVALID").optional(),
    keysHandedOver: z.literal(true),
    conformityAccepted: z.literal(true),
    odometerAtDelivery: nonNegativeIntSchema,
    supervisorOverrideId: cuidSchema.optional(),
    supervisorNotes: z.string().trim().min(10).max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.supervisorOverrideId) {
      if (!value.supervisorNotes) {
        context.addIssue({
          code: "custom",
          path: ["supervisorNotes"],
          message: "SUPERVISOR_NOTES_REQUIRED_FOR_OVERRIDE",
        });
      }
    }
  });

export type DeliveryInput = z.infer<typeof deliverySchema>;
