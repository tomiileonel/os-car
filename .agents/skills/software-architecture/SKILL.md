---
name: software-architecture
description: Directrices de arquitectura limpia, modular monolith y patrones de diseño para OS-CAR.
---

# Software Architecture Skill — OS-CAR

Esta skill proporciona las pautas normativas de diseño arquitectónico para el sistema OS-CAR.

## 1. Arquitectura en Capas (Clean Architecture)
El código debe estructurarse respetando la regla de dependencias: las capas internas jamás dependen de las externas.

```text
[ Presentation Layer ] (Next.js Pages, Server/Client Components, Tailwind UI)
         ↓
[ Application Layer ]  (Server Actions, Use Cases, DTOs, Zod Validation)
         ↓
[ Domain Layer ]       (Entities, Value Objects, Domain Events, State Machines)
         ↑
[ Infrastructure Layer](Prisma Repositories, Neon DB, Resend, WhatsApp, S3)
```

## 2. Convenciones de Mutación y Server Actions
Toda mutación de datos desde la UI debe ejecutarse mediante Server Actions fuertemente tipadas:

```typescript
// Ejemplo de Server Action canónica
"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

const CreateRepairOrderSchema = z.object({
  vehicleId: z.string().cuid(),
  customerId: z.string().cuid(),
  odometer: z.number().int().positive(),
  fuelLevel: z.enum(["EMPTY", "QUARTER", "HALF", "THREE_QUARTERS", "FULL"]),
  intakeNotes: z.string().min(5).max(1000),
});

export type CreateRepairOrderInput = z.infer<typeof CreateRepairOrderSchema>;

export async function createRepairOrderAction(rawInput: unknown) {
  const session = await auth();
  if (!session?.user?.workshopId) {
    return { success: false, error: "UNAUTHORIZED" as const };
  }

  const parsed = CreateRepairOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { 
      success: false, 
      error: "VALIDATION_ERROR" as const, 
      details: parsed.error.flatten() 
    };
  }

  try {
    const newOrder = await prisma.repairOrder.create({
      data: {
        ...parsed.data,
        workshopId: session.user.workshopId,
        status: "DRAFT",
      },
    });

    revalidatePath("/workshop/orders");
    return { success: true, data: newOrder };
  } catch (err) {
    console.error("Failed to create repair order", err);
    return { success: false, error: "INTERNAL_ERROR" as const };
  }
}
```

## 3. Principios de Modularidad
- Cada módulo de negocio (`vehicles`, `repair-orders`, `inventory`, `billing`) expone únicamente su API pública a través de su punto de entrada (`index.ts`).
- Ningún módulo debe realizar consultas SQL directas sobre tablas de otro módulo sin pasar por el servicio o repositorio de dominio correspondiente.
- Para comunicación desacoplada entre módulos se debe utilizar eventos de dominio internos (`DomainEvents`).

## 4. Registro de Decisiones de Arquitectura (ADR)
Cualquier modificación estructural que introduzca nuevas tecnologías, modifique el flujo de autenticación o altere el modelo de datos central requiere redactar un ADR bajo `.agents/templates/ADR.md`.
