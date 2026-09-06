import { describe, expect, it } from "vitest";
import { createTrackingToken, hashTrackingToken } from "@/lib/tracking-token";
import { publicIntakeSchema, publicTrackingSchema } from "@/shared/schemas";

const validIntake = {
  fullName: "María Taller",
  phoneE164: "+5491112345678",
  vehicleType: "AUTO" as const,
  licensePlate: "AA123AA",
  make: "Toyota",
  model: "Corolla",
  modelYear: 2020,
  odometerAtIntake: 85000,
  fuelLevel: "MITAD" as const,
  customerComplaint: "Hace ruido al frenar",
};

describe("public intake contracts", () => {
  it("accepts a complete customer intake and normalizes the license plate", () => {
    const result = publicIntakeSchema.parse(validIntake);

    expect(result.licensePlate).toBe("AA123AA");
    expect(result.odometerAtIntake).toBe(85000);
  });

  it("rejects invalid phone numbers and negative odometers", () => {
    expect(() => publicIntakeSchema.parse({ ...validIntake, phoneE164: "1112345678" })).toThrow();
    expect(() => publicIntakeSchema.parse({ ...validIntake, odometerAtIntake: -1 })).toThrow();
  });
});

describe("public tracking token", () => {
  it("creates a 256-bit base64url token and a deterministic non-reversible digest", () => {
    const token = createTrackingToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashTrackingToken(token)).toHaveLength(64);
    expect(hashTrackingToken(token)).toBe(hashTrackingToken(token));
    expect(hashTrackingToken(token)).not.toBe(hashTrackingToken(createTrackingToken()));
  });

  it("rejects tokens that do not have the expected entropy envelope", () => {
    expect(() => publicTrackingSchema.parse({ trackingToken: "ABC-1234" })).toThrow();
  });
});
