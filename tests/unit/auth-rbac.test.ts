import { describe, it, expect, vi, beforeEach } from "vitest";
import { headers } from "next/headers";
import {
  requireActiveAdmin,
  requireActiveAdminSsr,
  requireActiveAdminApi,
} from "../../src/server/auth/active-admin";
import { UnauthorizedException, ForbiddenException } from "../../src/shared/errors";

const mocks = vi.hoisted(() => ({
  prisma: {
    adminUser: {
      findFirst: vi.fn(),
    },
  },
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
  headers: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("~/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

function mockApiHeaders() {
  mocks.headers.mockResolvedValue(
    new Headers({ accept: "application/json" }) as unknown as Awaited<ReturnType<typeof headers>>
  );
}

function mockRscHeaders() {
  mocks.headers.mockResolvedValue(
    new Headers() as unknown as Awaited<ReturnType<typeof headers>>
  );
}

describe("auth-rbac — requireActiveAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sesión nula", () => {
    it("lanza UnauthorizedException en contexto API", async () => {
      mocks.auth.api.getSession.mockResolvedValue(null);
      mockApiHeaders();

      await expect(requireActiveAdmin()).rejects.toThrow(UnauthorizedException);
    });

    it("redirige a /admin/login en contexto RSC", async () => {
      mocks.auth.api.getSession.mockResolvedValue(null);
      mockRscHeaders();

      await expect(requireActiveAdmin()).rejects.toThrow("REDIRECT:/admin/login");
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
    });
  });

  describe("admin inexistente en base de datos", () => {
    it("lanza ForbiddenException ADMIN_INACTIVE en API", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue(null);
      mockApiHeaders();

      await expect(requireActiveAdmin()).rejects.toThrow(ForbiddenException);
      try {
        await requireActiveAdmin();
      } catch (error) {
        if (error instanceof ForbiddenException) {
          expect(error.problem.code).toBe("ADMIN_INACTIVE");
        }
      }
    });

    it("redirige a /admin/login en RSC", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue(null);
      mockRscHeaders();

      await expect(requireActiveAdmin()).rejects.toThrow("REDIRECT:/admin/login");
    });
  });

  describe("admin inactivo o soft-deleted", () => {
    it("lanza ForbiddenException cuando active es false", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue(null);
      mockApiHeaders();

      await expect(requireActiveAdmin()).rejects.toThrow(ForbiddenException);
    });

    it("lanza ForbiddenException cuando deletedAt no es null", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue(null);
      mockApiHeaders();

      await expect(requireActiveAdmin()).rejects.toThrow(ForbiddenException);
    });
  });

  describe("validación de roles", () => {
    it("lanza ForbiddenException INSUFFICIENT_ROLE_PERMISSIONS cuando el rol no coincide", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_123",
        authUserId: "user_123",
        workshopId: "ws_123",
        role: "RECEPCIONISTA",
        active: true,
        deletedAt: null,
      });
      mockApiHeaders();

      await expect(
        requireActiveAdmin({ roles: ["SUPER_ADMIN", "ADMIN_TALLER"] })
      ).rejects.toThrow(ForbiddenException);
      try {
        await requireActiveAdmin({ roles: ["SUPER_ADMIN", "ADMIN_TALLER"] });
      } catch (error) {
        if (error instanceof ForbiddenException) {
          expect(error.problem.code).toBe("INSUFFICIENT_ROLE_PERMISSIONS");
        }
      }
    });

    it("permite acceso cuando el rol está en la lista de roles autorizados", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_123",
        authUserId: "user_123",
        workshopId: "ws_123",
        role: "ADMIN_TALLER",
        active: true,
        deletedAt: null,
      });
      mockApiHeaders();

      const result = await requireActiveAdmin({
        roles: ["SUPER_ADMIN", "ADMIN_TALLER"],
      });
      expect(result.adminUser.role).toBe("ADMIN_TALLER");
    });
  });

  describe("resolución exitosa", () => {
    it("retorna ActiveAdminContext con workshopId vinculado de DB", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test User" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_123",
        authUserId: "user_123",
        workshopId: "ws_456",
        role: "SUPER_ADMIN",
        active: true,
        deletedAt: null,
      });
      mockApiHeaders();

      const result = await requireActiveAdmin();

      expect(result.sessionUser.id).toBe("user_123");
      expect(result.sessionUser.email).toBe("test@example.com");
      expect(result.sessionUser.name).toBe("Test User");
      expect(result.adminUser.id).toBe("admin_123");
      expect(result.adminUser.workshopId).toBe("ws_456");
      expect(result.adminUser.role).toBe("SUPER_ADMIN");
      expect(result.adminUser.active).toBe(true);
      expect(result.workshopId).toBe("ws_456");
    });

    it("workshopId siempre viene de DB, nunca del cliente", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_123", email: "test@example.com", name: "Test" },
        session: { id: "session_123" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_123",
        authUserId: "user_123",
        workshopId: "ws_from_db",
        role: "MECANICO",
        active: true,
        deletedAt: null,
      });
      mockApiHeaders();

      const result = await requireActiveAdmin();

      expect(result.workshopId).toBe("ws_from_db");
      expect(result.adminUser.workshopId).toBe("ws_from_db");
    });
  });

  describe("requireActiveAdminSsr — variante explícita SSR / RSC", () => {
    it("redirige a /admin/login si la sesión es nula", async () => {
      mocks.auth.api.getSession.mockResolvedValue(null);

      await expect(requireActiveAdminSsr()).rejects.toThrow("REDIRECT:/admin/login");
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
    });

    it("redirige a /admin/login si no existe adminUser activo", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_1", email: "u1@test.com" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue(null);

      await expect(requireActiveAdminSsr()).rejects.toThrow("REDIRECT:/admin/login");
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
    });

    it("redirige a /admin/login si el rol es insuficiente", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_1", email: "u1@test.com" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_1",
        authUserId: "user_1",
        workshopId: "ws_1",
        role: "MECANICO",
        active: true,
      });

      await expect(
        requireActiveAdminSsr({ roles: ["SUPER_ADMIN"] })
      ).rejects.toThrow("REDIRECT:/admin/login");
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/login");
    });

    it("retorna contexto válido en autenticación exitosa", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_1", email: "u1@test.com", name: "User One" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_1",
        authUserId: "user_1",
        workshopId: "ws_1",
        role: "ADMIN_TALLER",
        active: true,
      });

      const context = await requireActiveAdminSsr({
        roles: ["ADMIN_TALLER", "SUPER_ADMIN"],
      });

      expect(context.adminUser.role).toBe("ADMIN_TALLER");
      expect(context.workshopId).toBe("ws_1");
    });
  });

  describe("requireActiveAdminApi — variante explícita Route Handlers", () => {
    it("lanza UnauthorizedException (SESSION_REQUIRED) si no hay sesión", async () => {
      mocks.auth.api.getSession.mockResolvedValue(null);

      await expect(requireActiveAdminApi()).rejects.toThrow(UnauthorizedException);
      try {
        await requireActiveAdminApi();
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          expect(error.problem.code).toBe("SESSION_REQUIRED");
        }
      }
    });

    it("lanza ForbiddenException (ADMIN_INACTIVE) si el admin no existe o está inactivo", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_2", email: "u2@test.com" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue(null);

      await expect(requireActiveAdminApi()).rejects.toThrow(ForbiddenException);
      try {
        await requireActiveAdminApi();
      } catch (error) {
        if (error instanceof ForbiddenException) {
          expect(error.problem.code).toBe("ADMIN_INACTIVE");
        }
      }
    });

    it("lanza ForbiddenException (INSUFFICIENT_ROLE_PERMISSIONS) si el rol no es suficiente", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_2", email: "u2@test.com" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_2",
        authUserId: "user_2",
        workshopId: "ws_2",
        role: "RECEPCIONISTA",
        active: true,
      });

      await expect(
        requireActiveAdminApi({ roles: ["SUPER_ADMIN"] })
      ).rejects.toThrow(ForbiddenException);
      try {
        await requireActiveAdminApi({ roles: ["SUPER_ADMIN"] });
      } catch (error) {
        if (error instanceof ForbiddenException) {
          expect(error.problem.code).toBe("INSUFFICIENT_ROLE_PERMISSIONS");
        }
      }
    });

    it("retorna contexto con workshopId vinculado desde DB", async () => {
      mocks.auth.api.getSession.mockResolvedValue({
        user: { id: "user_2", email: "u2@test.com" },
      });
      mocks.prisma.adminUser.findFirst.mockResolvedValue({
        id: "admin_2",
        authUserId: "user_2",
        workshopId: "ws_db_enforced",
        role: "SUPER_ADMIN",
        active: true,
      });

      const context = await requireActiveAdminApi({ roles: ["SUPER_ADMIN"] });

      expect(context.workshopId).toBe("ws_db_enforced");
      expect(context.adminUser.id).toBe("admin_2");
    });
  });
});
