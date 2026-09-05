import { z } from "zod";
import {
  cuidSchema,
  licensePlateSchema,
  nonNegativeIntSchema,
  paginationQuerySchema,
  vinSchema,
} from "./common";

const CURRENT_YEAR = new Date().getFullYear();

const vehicleEditableFields = {
  vin: vinSchema.optional(),
  make: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().max(80).optional(),
  modelYear: z.number().int().min(1886).max(CURRENT_YEAR + 1).optional(),
  color: z.string().trim().max(60).optional(),
} as const;

export const createVehicleSchema = z
  .object({
    customerId: cuidSchema,
    licensePlate: licensePlateSchema,
    odometerAtIntake: nonNegativeIntSchema.optional(),
    ...vehicleEditableFields,
  })
  .strict();

export const updateVehicleSchema = z
  .object({ vehicleId: cuidSchema, ...vehicleEditableFields })
  .partial()
  .required({ vehicleId: true })
  .strict();

export const vehicleQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().max(120).optional(),
    licensePlate: licensePlateSchema.optional(),
  })
  .strict();

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleQuery = z.infer<typeof vehicleQuerySchema>;
