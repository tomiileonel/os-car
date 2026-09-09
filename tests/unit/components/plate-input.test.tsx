// @vitest-environment jsdom
/**
 * OS-CAR · Gate G6 — PlateInput: normalización, validación y eventos.
 */
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PlateInput,
  getPlateValidity,
  isLegacyArgentinePlate,
  isMercosurPlate,
  isValidPlate,
  normalizePlate,
} from "@/components/ui/plate-input";

function asInput(element: HTMLElement): HTMLInputElement {
  return element as HTMLInputElement;
}

function StatefulPlateInput(props: { initial?: string | undefined }) {
  const [value, setValue] = useState(props.initial ?? "");
  return React.createElement(PlateInput, { label: "Patente", value, onChange: setValue });
}

describe("normalizePlate", () => {
  it("convierte a mayúsculas y elimina espacios y guiones", () => {
    expect(normalizePlate("ab-123 cd")).toBe("AB123CD");
    expect(normalizePlate("  abc 123  ")).toBe("ABC123");
    expect(normalizePlate("AB-123-CD")).toBe("AB123CD");
  });

  it("recorta a 10 caracteres máximo (contrato Zod §21)", () => {
    expect(normalizePlate("AB123CDE99XX")).toBe("AB123CDE99");
    expect(normalizePlate("AB123CDE99XX").length).toBe(10);
  });

  it("no altera valores ya normalizados", () => {
    expect(normalizePlate("ABC123")).toBe("ABC123");
    expect(normalizePlate("AB123CDE")).toBe("AB123CDE");
  });
});

describe("isValidPlate / detectores de formato", () => {
  it("acepta patentes argentinas históricas y Mercosur", () => {
    expect(isValidPlate("ABC123")).toBe(true);
    expect(isValidPlate("AB123CDE")).toBe(true);
  });

  it("rechaza valores cortos, largos o con caracteres fuera del alfabeto", () => {
    expect(isValidPlate("AB1")).toBe(false);
    expect(isValidPlate("ABCD1")).toBe(true); // 5 caracteres válidos
    expect(isValidPlate("AB123CDE99X")).toBe(false); // 11 caracteres
    expect(isValidPlate("ABC-12")).toBe(false); // guion sin normalizar
    expect(isValidPlate("ABC 12")).toBe(false); // espacio sin normalizar
    expect(isValidPlate("abc123")).toBe(false); // minúsculas sin normalizar
  });

  it("distingue formato histórico de Mercosur", () => {
    expect(isLegacyArgentinePlate("ABC123")).toBe(true);
    expect(isLegacyArgentinePlate("AB123CDE")).toBe(false);
    expect(isMercosurPlate("AB123CDE")).toBe(true);
    expect(isMercosurPlate("ABC123")).toBe(false);
  });

  it("getPlateValidity cubre vacío, incompleto y válido", () => {
    expect(getPlateValidity("")).toBe("empty");
    expect(getPlateValidity("AB1")).toBe("incomplete");
    expect(getPlateValidity("ABC123")).toBe("valid");
  });
});

describe("<PlateInput />", () => {
  it("renderiza el label asociado al input", () => {
    render(React.createElement(PlateInput, { label: "Patente", value: "", onChange: () => {} }));
    const input = screen.getByLabelText("Patente");
    expect(input).toBeDefined();
    expect(input.tagName).toBe("INPUT");
  });

  it("emite onChange con el valor normalizado (mayúsculas, sin espacios/guiones)", () => {
    const onChange = vi.fn();
    render(React.createElement(PlateInput, { label: "Patente", value: "", onChange }));
    const input = screen.getByLabelText("Patente");

    fireEvent.change(input, { target: { value: "ab-123 cd" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("AB123CD");
  });

  it("componente controlado: muestra el valor normalizado al tipear", () => {
    render(React.createElement(StatefulPlateInput));
    const input = asInput(screen.getByLabelText("Patente"));

    fireEvent.change(input, { target: { value: "ab 123" } });
    expect(input.value).toBe("AB123");

    fireEvent.change(input, { target: { value: "ab-123-cde" } });
    expect(input.value).toBe("AB123CDE");
  });

  it("valor incompleto: muestra error visual y aria-invalid", () => {
    render(React.createElement(PlateInput, { label: "Patente", value: "AB1", onChange: () => {} }));
    const input = screen.getByLabelText("Patente");

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Patente incompleta: faltan 2 caracteres\./)).toBeDefined();
  });

  it("valor válido: sin aria-invalid y con mensaje de formato", () => {
    render(React.createElement(PlateInput, { label: "Patente", value: "ABC123", onChange: () => {} }));
    const input = screen.getByLabelText("Patente");

    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByText("Formato argentino válido.")).toBeDefined();
  });

  it("valor Mercosur válido muestra su formato específico", () => {
    render(React.createElement(PlateInput, { label: "Patente", value: "AB123CDE", onChange: () => {} }));
    expect(screen.getByText("Formato Mercosur válido.")).toBeDefined();
  });

  it("respeta disabled y maxLength", () => {
    render(React.createElement(PlateInput, { label: "Patente", value: "", onChange: () => {}, disabled: true }));
    const input = asInput(screen.getByLabelText("Patente"));

    expect(input.disabled).toBe(true);
    expect(input.maxLength).toBe(10);
  });
});
