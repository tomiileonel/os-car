---
name: ui-system
description: Sistema de diseño UI/UX, Tailwind CSS v4, interfaces táctiles para talleres y accesibilidad WCAG.
---

# UI System & Design Skill — OS-CAR

Esta skill contiene las directrices de diseño visual, componentes y experiencia de usuario (UX) para OS-CAR.

## 1. Ergonomía para Pantallas de Taller Mecánico
El entorno de un taller mecánico exige consideraciones especiales:
- **Modo Oscuro con Alto Contraste**: Reduce el deslumbramiento en fosas de trabajo y zonas iluminadas por reflectores.
- **Blancos Táctiles Grandes (Touch Targets)**: Todo botón o control interactivo debe tener al menos `48x48px` para facilitar su pulsación con dedos enguantados o en tablets sucias.
- **Teclado Numérico Directo**: Los inputs de kilometraje, combustible y precios deben usar `inputMode="numeric"` o `pattern="[0-9]*"` para desplegar el teclado numérico en dispositivos móviles sin pasos extra.

## 2. Paleta Semántica y Tokens de Diseño
```css
/* Tailwind CSS v4 Tokens */
:root {
  --background: #090d16;
  --surface: #111827;
  --surface-raised: #1f2937;
  --border: #374151;
  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --accent: #f59e0b; /* Indicador automotriz de precaución / pendiente */
  --success: #10b981; /* Vehículo listo / Aprobado */
  --destructive: #ef4444; /* Cancelado / Alerta de stock */
  --text-main: #f9fafb;
  --text-muted: #9ca3af;
}
```

## 3. Checklist Visual de Daños Vehiculares (Car Body Diagram)
La pantalla de recepción incluye un diagrama SVG interactivo del vehículo (frente, laterales, trasera, techo) donde el asesor puede marcar con un toque:
- Rayón / Raspón (color amarillo)
- Abolladura / Choque (color rojo)
- Rotura de óptica / cristal (color naranja)
- Cada marca permite adjuntar una fotografía capturada al instante desde la cámara de la tablet.

## 4. Accesibilidad (WCAG 2.1 AA)
- Contraste de texto mínimo de 4.5:1 contra el fondo.
- Elementos interactivos con anillo de foco visible (`focus-visible:ring-2 focus-visible:ring-primary`).
- Formularios con etiquetas explícitas (`<label htmlFor="...">`) y mensajes de error asociados mediante `aria-describedby`.
