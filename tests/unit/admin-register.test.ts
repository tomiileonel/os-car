import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminRegisterSchema } from "@/shared/schemas/admin-register";
import { registerAdmin } from "@/server/services/admin-register.service";
import { getAdminBootstrapStatus } from "@/server/services/admin-bootstrap.service";
import { prisma } from "@/server/db";
import { auth } from "~/lib/auth";
import { ForbiddenException, DomainConflictException } from "@/shared/errors";

vi.mock("@/server/db", () => ({
  prisma: {
    workshop: {
      findFirst: vi.fn(),
    },
    adminUser: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(prisma)),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("~/lib/auth", () => ({
  INTERNAL_SIGNUP_HEADER: "x-oscar-internal-signup",
  auth: {
    api: {
      signUpEmail: vi.fn(),
    },
  },
}));

vi.mock("@/server/audit/audit.service", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue({ id: "audit_1" }),
}));

describe("adminRegisterSchema (Zod validation contract)", () => {
  it("valida correctamente un comando de registro de bootstrap completo", () => {
    const valid = {
      displayName: "Juan Pérez",
      email: "juan@taller.com",
      password: "SuperSecretPassword123",
    };
    const parsed = adminRegisterSchema.parse(valid);
    expect(parsed.displayName).toBe("Juan Pérez");
    expect(parsed.email).toBe("juan@taller.com");
  });

  it("normaliza el email a minúsculas y elimina espacios", () => {
    const parsed = adminRegisterSchema.parse({
      displayName: "  Carlos Gómez  ",
      email: "  CARLOS@TALLER.COM  ",
      password: "Password12345",
    });
    expect(parsed.displayName).toBe("Carlos Gómez");
    expect(parsed.email).toBe("carlos@taller.com");
  });

  it("rechaza contraseñas de menos de 8 caracteres", () => {
    expect(() =>
      adminRegisterSchema.parse({
        displayName: "Carlos",
        email: "carlos@taller.com",
        password: "short",
      })
    ).toThrow();
  });

  it("rechaza emails inválidos", () => {
    expect(() =>
      adminRegisterSchema.parse({
        displayName: "Carlos",
        email: "no-un-email",
        password: "Password12345",
      })
    ).toThrow();
  });

  it("rechaza nombres vacíos o menores a 2 caracteres", () => {
    expect(() =>
      adminRegisterSchema.parse({
        displayName: "J",
        email: "j@taller.com",
        password: "Password12345",
      })
    ).toThrow();
  });
});

describe("getAdminBootstrapStatus (Regla canónica de bootstrap)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite el registro cuando hay 0 administradores activos", async () => {
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0);

    const status = await getAdminBootstrapStatus();
    expect(status.canRegister).toBe(true);
    expect(status.adminCount).toBe(0);
    expect(prisma.adminUser.count).toHaveBeenCalledWith({
      where: { active: true, deletedAt: null },
    });
  });

  it("bloquea el registro cuando ya existe 1 o más administradores activos", async () => {
    vi.mocked(prisma.adminUser.count).mockResolvedValue(1);

    const status = await getAdminBootstrapStatus();
    expect(status.canRegister).toBe(false);
    expect(status.adminCount).toBe(1);
  });
});

describe("registerAdmin (Service logic & compensación de seguridad)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = "super-secret-key-that-is-at-least-32-chars-long";
  });

  it("permite el bootstrap del primer admin como OWNER si el taller no tiene admins", async () => {
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0);
    vi.mocked(prisma.workshop.findFirst).mockResolvedValue({
      id: "workshop_1",
      name: "Taller Central",
    } as any);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);

    vi.mocked(auth.api.signUpEmail).mockResolvedValue({
      user: {
        id: "auth_user_1",
        email: "owner@taller.com",
        name: "Dueño Inicial",
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: false,
      },
    } as any);

    vi.mocked(prisma.adminUser.create).mockResolvedValue({
      id: "admin_user_1",
      workshopId: "workshop_1",
      authUserId: "auth_user_1",
      displayName: "Dueño Inicial",
      email: "owner@taller.com",
      role: "OWNER",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      tokenVersion: 1,
      passwordChangedAt: new Date(),
    });

    const result = await registerAdmin({
      displayName: "Dueño Inicial",
      email: "owner@taller.com",
      password: "SecureOwnerPassword2026",
    });

    expect(result.role).toBe("OWNER");
    expect(result.email).toBe("owner@taller.com");
    expect(auth.api.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it("bloquea con ForbiddenException el registro si ya existe ≥1 admin (segunda cuenta rechazada)", async () => {
    vi.mocked(prisma.adminUser.count).mockResolvedValue(1);

    await expect(
      registerAdmin({
        displayName: "Segundo Administrador",
        email: "segundo@taller.com",
        password: "Password12345",
      })
    ).rejects.toThrow(ForbiddenException);

    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  it("rechaza el registro si ya existe un admin con ese email (409 Domain Conflict)", async () => {
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0);
    vi.mocked(prisma.workshop.findFirst).mockResolvedValue({
      id: "workshop_1",
      name: "Taller Central",
    } as any);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({ id: "existing_admin" } as any);

    await expect(
      registerAdmin({
        displayName: "Dueño Repetido",
        email: "repetido@taller.com",
        password: "Password12345",
      })
    ).rejects.toThrow(DomainConflictException);

    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  it("ejecuta compensación y borra el usuario de Better Auth si la creación en Prisma falla", async () => {
    vi.mocked(prisma.adminUser.count).mockResolvedValue(0);
    vi.mocked(prisma.workshop.findFirst).mockResolvedValue({
      id: "workshop_1",
      name: "Taller Central",
    } as any);
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);

    vi.mocked(auth.api.signUpEmail).mockResolvedValue({
      user: {
        id: "auth_user_failed_prisma",
        email: "fallo@taller.com",
        name: "Fallo Prisma",
      },
    } as any);

    // Simulamos fallo en Prisma
    vi.mocked(prisma.adminUser.create).mockRejectedValue(new Error("Prisma connection failure"));

    await expect(
      registerAdmin({
        displayName: "Fallo Prisma",
        email: "fallo@taller.com",
        password: "Password12345",
      })
    ).rejects.toThrow("Prisma connection failure");

    // Verificamos que la compensación intentó purgar el usuario huérfano
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});


