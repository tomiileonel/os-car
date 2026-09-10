import { PrismaClient, OrderStatus, FuelLevel } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

export async function seedG11() {
  console.log("[Seed G11] Starting seed execution...");

  // 1. Talleres aislados (C1 Multi-Tenant)
  const alpha = await prisma.workshop.upsert({
    where: { id: "workshop_alpha" },
    update: {},
    create: {
      id: "workshop_alpha",
      name: "Taller Alpha G11",
      timezone: "America/Argentina/Buenos_Aires",
    },
  });

  const beta = await prisma.workshop.upsert({
    where: { id: "workshop_beta" },
    update: {},
    create: {
      id: "workshop_beta",
      name: "Taller Beta G11",
      timezone: "America/Argentina/Buenos_Aires",
    },
  });

  // Admin users for both workshops
  await prisma.adminUser.upsert({
    where: { authUserId: "auth_admin_alpha" },
    update: {},
    create: {
      id: "admin_alpha_1",
      workshopId: alpha.id,
      authUserId: "auth_admin_alpha",
      displayName: "Jefe de Taller Alpha",
      role: "ADMIN",
      active: true,
    },
  });

  await prisma.adminUser.upsert({
    where: { authUserId: "auth_admin_beta" },
    update: {},
    create: {
      id: "admin_beta_1",
      workshopId: beta.id,
      authUserId: "auth_admin_beta",
      displayName: "Jefe de Taller Beta",
      role: "ADMIN",
      active: true,
    },
  });

  // Bahías
  await prisma.bay.upsert({
    where: { id: "bay_alpha_1" },
    update: {},
    create: {
      id: "bay_alpha_1",
      workshopId: alpha.id,
      code: "B1 - ELEVADOR 1",
      status: "LIBRE",
      ordinal: 1,
    },
  });

  // 2. Vehículos y Clientes con Patentes Argentinas y Teléfonos E.164
  const plates = [
    { plate: "AB 123 CD", model: "Gol Trend", make: "Volkswagen", year: 2019, phone: "+5491144332211" },
    { plate: "AA 000 AA", model: "Cronos", make: "Fiat", year: 2022, phone: "+5491155443322" },
    { plate: "AF 456 GH", model: "208", make: "Peugeot", year: 2023, phone: "+5491166554433" },
    { plate: "AG 789 JK", model: "Hilux", make: "Toyota", year: 2021, phone: "+5491177665544" },
    { plate: "AD 111 OP", model: "Cruze", make: "Chevrolet", year: 2020, phone: "+5491188776655" },
    { plate: "AE 222 QR", model: "Corolla", make: "Toyota", year: 2024, phone: "+5491199887766" },
    { plate: "AC 333 ST", model: "Ranger", make: "Ford", year: 2021, phone: "+5491122334455" },
    { plate: "AH 444 UV", model: "Yaris", make: "Toyota", year: 2022, phone: "+5491133221100" },
  ];

  const createdVehicles = [];

  for (let i = 0; i < plates.length; i++) {
    const item = plates[i];
    const normalized = item.plate.replace(/[\s-]/g, "").toUpperCase();

    const customer = await prisma.customer.upsert({
      where: { id: `customer_g11_${i}` },
      update: {},
      create: {
        id: `customer_g11_${i}`,
        workshopId: alpha.id,
        fullName: `Cliente ${item.model} (${normalized})`,
        phoneE164: item.phone,
        phoneNormalized: item.phone.replace("+", ""),
      },
    });

    const vehicle = await prisma.vehicle.upsert({
      where: { id: `vehicle_g11_${i}` },
      update: {},
      create: {
        id: `vehicle_g11_${i}`,
        workshopId: alpha.id,
        customerId: customer.id,
        licensePlate: item.plate,
        licensePlateNormalized: normalized,
        make: item.make,
        model: item.model,
        modelYear: item.year,
        color: "Gris",
      },
    });

    createdVehicles.push({ vehicle, customer });
  }

  // 3. Órdenes representativas en cada uno de los 8 estados FSM
  const states: OrderStatus[] = [
    "INGRESADO",
    "DIAGNOSTICO",
    "ESPERANDO_REPARACION",
    "EN_REPARACION",
    "CONTROL",
    "LISTO",
    "ENTREGADO",
    "CANCELADA",
  ];

  for (let i = 0; i < states.length; i++) {
    const status = states[i];
    const { vehicle, customer } = createdVehicles[i];
    const orderId = `wo_g11_${status.toLowerCase()}`;
    const tokenHash = createHash("sha256").update(`seed_token_${orderId}`).digest("hex");

    const order = await prisma.workOrder.upsert({
      where: { id: orderId },
      update: { status },
      create: {
        id: orderId,
        workshopId: alpha.id,
        customerId: customer.id,
        vehicleId: vehicle.id,
        status,
        version: 1,
        trackingCodeHash: tokenHash,
        trackingCodeIssuedAt: new Date(),
        intakeRecord: {
          create: {
            odometerAtIntake: 50000 + i * 5000,
            fuelLevel: FuelLevel.MITAD,
            customerComplaint: `Chequeo preventivo en estado ${status}`,
          },
        },
      },
    });

    // Añadir presupuesto con líneas y campo isApproved (N6) en órdenes seleccionadas
    if (status === "ESPERANDO_REPARACION" || status === "EN_REPARACION") {
      const budgetId = `budget_${order.id}`;
      const versionId = `bv_${order.id}_1`;

      const existingBudget = await prisma.budget.findUnique({ where: { workOrderId: order.id } });
      if (!existingBudget) {
        await prisma.budget.create({
          data: {
            id: budgetId,
            workOrderId: order.id,
            versions: {
              create: {
                id: versionId,
                versionNumber: 1,
                status: status === "EN_REPARACION" ? "APROBADO" : "PENDIENTE_APROBACION",
                subtotalLabor: 30000,
                subtotalParts: 20000,
                totalEstimated: 50000,
                laborLines: {
                  create: [
                    {
                      description: "Revisión completa de tren delantero",
                      estimatedMinutes: 120,
                      hourlyRateCharged: 15000,
                      lineTotal: 30000,
                      isApproved: true,
                    },
                  ],
                },
                partLines: {
                  create: [
                    {
                      description: "Bujes de parrilla",
                      quantity: 2,
                      unitPriceCharged: 10000,
                      lineTotal: 20000,
                      isApproved: status === "EN_REPARACION" ? true : false,
                    },
                  ],
                },
              },
            },
          },
        });
        await prisma.budget.update({
          where: { id: budgetId },
          data: { currentVersionId: versionId },
        });
      }
    }
  }

  console.log("✅ Seed G11 successfully completed (Alpha, Beta, 8 AR Vehicles, 8 FSM States, Budgets with isApproved).");
}

seedG11()
  .catch((e) => {
    console.error("Error in Seed G11:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
