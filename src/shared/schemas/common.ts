import { z } from "zod";

export const cuidSchema = z.string().cuid();
export const workshopIdSchema = z.string().cuid();

export const moneyStringSchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "MONEY_FORMAT_INVALID");

export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();

export const phoneE164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{7,14}$/, "PHONE_MUST_BE_E164");

export const emailSchema = z.string().trim().email().max(254);

export const documentNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6,12}$/, "DOCUMENT_NUMBER_INVALID");

export const licensePlateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().min(5).max(10).regex(/^[A-Z0-9]+$/, "LICENSE_PLATE_INVALID"));

export const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN_INVALID");

export const trackingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{4}$/, "INVALID_TRACKING_CODE");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const actorTypeSchema = z.enum(["ADMIN", "CLIENTE", "SYSTEM"]);

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type ActorType = z.infer<typeof actorTypeSchema>;
export type MoneyString = z.infer<typeof moneyStringSchema>;
