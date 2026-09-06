import { z } from "zod";
import { emailSchema, licensePlateSchema, nonNegativeIntSchema, phoneE164Schema } from "./common";
import { vehicleTypeSchema } from "./vehicle";
import { fuelLevelSchema } from "./work-order";

export const publicIntakeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phoneE164: phoneE164Schema,
    email: emailSchema.optional(),
    vehicleType: vehicleTypeSchema,
    licensePlate: licensePlateSchema,
    make: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(80),
    modelYear: z.coerce.number().int().min(1886).max(new Date().getFullYear() + 1),
    odometerAtIntake: nonNegativeIntSchema,
    fuelLevel: fuelLevelSchema,
    customerComplaint: z.string().trim().min(5).max(2000),
  })
  .strict();

export const publicTrackingSchema = z
  .object({
    trackingToken: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/, "TRACKING_TOKEN_INVALID"),
  })
  .strict();

export type PublicIntakeInput = z.infer<typeof publicIntakeSchema>;
export type PublicTrackingInput = z.infer<typeof publicTrackingSchema>;
