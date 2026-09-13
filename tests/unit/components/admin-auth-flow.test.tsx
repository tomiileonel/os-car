// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomePage from "@/../app/page";
import { LoginForm } from "@/../app/admin/login/LoginForm";
import { RegisterForm } from "@/../app/admin/register/RegisterForm";
import { authClient } from "~/lib/auth-client";
import { adminRegisterApi } from "@/lib/api-client";

const pushMock = vi.fn();
const refreshMock = vi.fn();
let searchParamsMock = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => searchParamsMock,
  redirect: vi.fn(),
}));

vi.mock("~/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-client", () => ({
  adminRegisterApi: {
    register: vi.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(params: { message: string }) {
      super(params.message);
    }
  },
}));

describe("HomePage (Pantalla de entrada Moncar)", () => {
  it("muestra exactamente las 3 opciones principales de acceso operativo", () => {
    render(<HomePage />);

    const clientLink = screen.getByRole("link", { name: /soy cliente/i });
    expect(clientLink).toBeInTheDocument();
    expect(clientLink).toHaveAttribute("href", "/cliente/alta");
    expect(screen.getByText("Registrar mi vehículo y acceder al seguimiento.")).toBeInTheDocument();

    const trackingLink = screen.getByRole("link", { name: /seguir mi vehículo/i });
    expect(trackingLink).toBeInTheDocument();
    expect(trackingLink).toHaveAttribute("href", "/seguimiento");
    expect(screen.getByText("Consultar el estado, trabajos y costos de mi orden.")).toBeInTheDocument();

    const adminLink = screen.getByRole("link", { name: /soy admin/i });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute("href", "/admin/login");
    expect(screen.getByText("Registrarme o ingresar al panel operativo.")).toBeInTheDocument();
  });
});

describe("LoginForm (Flujo de autenticación administrativa y bootstrap condicionado)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock = new URLSearchParams();
  });

  it("muestra el enlace de crear cuenta si canRegister es true (bootstrap abierto)", () => {
    render(<LoginForm canRegister={true} />);

    expect(screen.getByRole("heading", { name: /panel del taller/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ingresar al taller/i })).toBeInTheDocument();

    const registerLink = screen.getByRole("link", { name: /crear cuenta/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute("href", "/admin/register");
  });

  it("oculta completamente el enlace de crear cuenta si canRegister es false (bootstrap cerrado)", () => {
    render(<LoginForm canRegister={false} />);

    expect(screen.queryByRole("link", { name: /crear cuenta/i })).not.toBeInTheDocument();
  });

  it("muestra error genérico ante fallo de credenciales (sin fuga de información)", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: {
        message: "User not found with email test@taller.com",
        status: 401,
        statusText: "Unauthorized",
      },
    } as any);

    render(<LoginForm canRegister={false} />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "desconocido@taller.com" } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: "wrongpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /ingresar al taller/i }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Credenciales inválidas o cuenta no autorizada.");
      expect(alert).not.toHaveTextContent("User not found");
    });
  });

  it("muestra el mensaje de éxito cuando proviene de un registro exitoso (?registered=1)", () => {
    searchParamsMock = new URLSearchParams("registered=1");
    render(<LoginForm canRegister={false} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /¡cuenta creada con éxito! por seguridad, ingresá con tu email y contraseña para acceder al panel/i
    );
  });
});

describe("RegisterForm (Registro del administrador inicial)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza el formulario de registro y el enlace para volver a iniciar sesión", () => {
    render(<RegisterForm />);

    expect(screen.getByRole("heading", { name: /crear cuenta de administrador/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument();
    // No debe existir campo de invitación en esta fase
    expect(screen.queryByLabelText(/código de invitación/i)).not.toBeInTheDocument();

    const loginLink = screen.getByRole("link", { name: /iniciar sesión/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute("href", "/admin/login");
  });

  it("redirige estrictamente a /admin/login?registered=1 tras un registro exitoso (sin sesión directa)", async () => {
    vi.mocked(adminRegisterApi.register).mockResolvedValue({
      adminUserId: "admin_1",
      email: "nuevo@taller.com",
      displayName: "Nuevo Dueño",
      role: "OWNER",
    });

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/nombre y apellido/i), { target: { value: "Nuevo Dueño" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "nuevo@taller.com" } });
    fireEvent.change(screen.getByLabelText(/^contraseña/i), { target: { value: "PasswordSegura123" } });
    fireEvent.change(screen.getByLabelText(/confirmar contraseña/i), { target: { value: "PasswordSegura123" } });

    fireEvent.click(screen.getByRole("button", { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin/login?registered=1");
    });
  });
});


