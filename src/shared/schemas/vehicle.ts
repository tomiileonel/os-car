import { z } from "zod";
import {
  cuidSchema,
  nonNegativeIntSchema,
  paginationQuerySchema,
} from "./common";

export function normalizeLicensePlate(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

const NORMALIZED_PLATE_REGEX = /^[A-Z0-9]{5,10}$/;

export const normalizedPlateSchema = z
  .string()
  .transform((v) => normalizeLicensePlate(v))
  .pipe(
    z
      .string()
      .min(5, "PLATE_TOO_SHORT")
      .max(10, "PLATE_TOO_LONG")
      .regex(NORMALIZED_PLATE_REGEX, "PLATE_FORMAT_INVALID")
  );

export const vehicleTypeSchema = z.enum(["AUTO", "CAMIONETA", "CAMION"]);
export type VehicleType = z.infer<typeof vehicleTypeSchema>;

export const createVehicleSchema = z
  .object({
    customerId: cuidSchema,
    licensePlate: z.string().transform((v) => normalizeLicensePlate(v)).pipe(
      z
        .string()
        .min(5, "PLATE_TOO_SHORT")
        .max(10, "PLATE_TOO_LONG")
        .regex(NORMALIZED_PLATE_REGEX, "PLATE_FORMAT_INVALID")
    ),
    vin: z
      .string()
      .trim()
      .toUpperCase()
      .length(17, "VIN_MUST_BE_17_CHARS")
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN_FORMAT_INVALID")
      .optional(),
    make: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(80).optional(),
    modelYear: z.number().int().min(1886).max(2100).optional(),
    vehicleType: vehicleTypeSchema.default("AUTO"),
    color: z.string().trim().max(60).optional(),
    odometerAtIntake: nonNegativeIntSchema.optional(),
  })
  .strict();

export const updateVehicleSchema = z
  .object({
    vehicleId: cuidSchema,
    vin: z
      .string()
      .trim()
      .toUpperCase()
      .length(17, "VIN_MUST_BE_17_CHARS")
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN_FORMAT_INVALID")
      .optional(),
    make: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(80).optional(),
    modelYear: z.number().int().min(1886).max(2100).optional(),
    vehicleType: vehicleTypeSchema.optional(),
    color: z.string().trim().max(60).nullable().optional(),
  })
  .strict();

export const vehicleQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().max(120).optional(),
    licensePlate: z.string().trim().max(15).optional(),
  })
  .strict();

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleQuery = z.infer<typeof vehicleQuerySchema>;
