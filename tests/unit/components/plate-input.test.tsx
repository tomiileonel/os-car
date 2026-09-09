// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PlateInput,
  normalizePlate,
  PLATE_MAX_LENGTH,
  PLATE_MIN_LENGTH,
} from "@/components/ui/plate-input";
import type { PlateNormalizationResult } from "@/components/ui/plate-input";

describe("normalizePlate (pure logic, mirrors backend Zod pipeline)", () => {
  it("uppercases lowercase input", () => {
    expect(normalizePlate("ab123cd").value).toBe("AB123CD");
  });

  it("strips internal and surrounding whitespace", () => {
    expect(normalizePlate("  ab 123 cd  ").value).toBe("AB123CD");
  });

  it("strips hyphens", () => {
    expect(normalizePlate("ab-123-cd").value).toBe("AB123CD");
  });

  it("clamps to PLATE_MAX_LENGTH characters", () => {
    const result = normalizePlate("ABCDEFGHIJKLMNOP");
    expect(result.value).toHaveLength(PLATE_MAX_LENGTH);
    expect(result.value).toBe("ABCDEFGHIJ");
  });

  it("PLATE_MAX_LENGTH is exactly 10 per backend contract", () => {
    expect(PLATE_MAX_LENGTH).toBe(10);
  });

  it("PLATE_MIN_LENGTH is exactly 5 per backend contract", () => {
    expect(PLATE_MIN_LENGTH).toBe(5);
  });

  it("marks a value below the minimum length as incomplete, not invalid", () => {
    const result = normalizePlate("AB1");
    expect(result.isComplete).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it("marks a complete alphanumeric value within bounds as valid", () => {
    const result = normalizePlate("AB123CD");
    expect(result.isComplete).toBe(true);
    expect(result.isValid).toBe(true);
  });

  it("rejects non-alphanumeric characters even after stripping known separators", () => {
    const result = normalizePlate("AB123#D");
    expect(result.isComplete).toBe(true);
    expect(result.isValid).toBe(false);
  });

  it("is idempotent: normalizing an already-normalized value returns the same value", () => {
    const once = normalizePlate("AB123CD");
    const twice = normalizePlate(once.value);
    expect(twice.value).toBe(once.value);
    expect(twice.isValid).toBe(once.isValid);
  });

  it("handles empty string without throwing", () => {
    const result = normalizePlate("");
    expect(result.value).toBe("");
    expect(result.isComplete).toBe(false);
    expect(result.isValid).toBe(false);
  });
});

describe("<PlateInput /> rendered behavior", () => {
  it("renders with an accessible label", () => {
    render(<PlateInput value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText("Patente")).toBeInTheDocument();
  });

  it("calls onChange with the normalized result on every keystroke", async () => {
    // PlateInput is a controlled component: it doesn't own its own state,
    // so the test must re-render with each onChange result (mirroring how
    // a real parent, like the intake form, feeds `value` back in) rather
    // than typing into a static, unbound `value=""`.
    const user = userEvent.setup();
    let currentResult = normalizePlate("");
    const handleChange = vi.fn((result: PlateNormalizationResult) => {
      currentResult = result;
    });

    function ControlledHarness() {
      const [result, setResult] = useState<PlateNormalizationResult>(normalizePlate(""));
      return (
        <PlateInput
          value={result.value}
          onChange={(r) => {
            handleChange(r);
            setResult(r);
          }}
        />
      );
    }

    render(<ControlledHarness />);
    const input = screen.getByLabelText("Patente");
    await user.type(input, "ab-123-cd");

    expect(currentResult).toEqual({ value: "AB123CD", isValid: true, isComplete: true });
  });

  it("enforces maxLength=10 at the DOM level", () => {
    render(<PlateInput value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Patente");
    expect(input).toHaveProperty("maxLength", PLATE_MAX_LENGTH);
  });

  it("shows an accessible error only once the value is complete and invalid", () => {
    const { rerender } = render(
      <PlateInput value="AB1" onChange={vi.fn()} showValidation />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<PlateInput value="AB1#5" onChange={vi.fn()} showValidation />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("wires aria-invalid and aria-describedby together when invalid", () => {
    render(<PlateInput value="AB1#5" onChange={vi.fn()} showValidation />);
    const input = screen.getByLabelText("Patente");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(/inválida/i);
  });

  it("does not set aria-invalid for a valid, complete plate", () => {
    render(<PlateInput value="AB123CD" onChange={vi.fn()} showValidation />);
    const input = screen.getByLabelText("Patente");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("respects disabled prop", () => {
    render(<PlateInput value="" onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText("Patente")).toBeDisabled();
  });
});
