// src/shared/schemas/customer.ts
import { z } from "zod";

const E164_PHONE = /^\+[1-9][0-9]{7,14}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(E164_PHONE, "PHONE_MUST_BE_E164");

export function normalizePhoneForIndex(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export const createCustomerSchema = z
  .object({
    workshopId: z.string().cuid(),
    fullName: z.string().trim().min(2).max(120),
    phoneE164: phoneSchema,
    email: z.string().trim().email().max(254).optional(),
  })
  .strict();

export const updateCustomerSchema = z
  .object({
    customerId: z.string().cuid(),
    workshopId: z.string().cuid(),
    fullName: z.string().trim().min(2).max(120).optional(),
    phoneE164: phoneSchema.optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.fullName !== undefined ||
      v.phoneE164 !== undefined ||
      v.email !== undefined,
    { message: "AT_LEAST_ONE_FIELD_REQUIRED" },
  );

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
