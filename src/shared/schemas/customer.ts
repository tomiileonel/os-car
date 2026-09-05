import { z } from "zod";
import {
  cuidSchema,
  documentNumberSchema,
  emailSchema,
  paginationQuerySchema,
  phoneE164Schema,
} from "./common";

const customerEditableFields = {
  fullName: z.string().trim().min(2).max(120),
  phoneE164: phoneE164Schema,
  email: emailSchema.optional(),
  documentNumber: documentNumberSchema.optional(),
} as const;

export const createCustomerSchema = z.object(customerEditableFields).strict();

export const updateCustomerSchema = z
  .object({ customerId: cuidSchema, ...customerEditableFields })
  .partial()
  .required({ customerId: true })
  .strict();

export const listCustomersQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().max(120).optional(),
    phone: phoneE164Schema.optional(),
  })
  .strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
