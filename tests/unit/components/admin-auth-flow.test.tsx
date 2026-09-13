// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/../app/page";
import AdminLoginPage from "@/../app/admin/login/page";
import AdminRegisterPage from "@/../app/admin/register/page";

const pushMock = vi.fn();
const refreshMock = vi.fn();
let searchParamsMock = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => searchParamsMock,
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

describe("AdminLoginPage (Flujo de autenticación administrativa)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock = new URLSearchParams();
  });

  it("renderiza el formulario de login y los accesos a crear cuenta y volver al inicio", () => {
    render(<AdminLoginPage />);

    expect(screen.getByRole("heading", { name: /panel del taller/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ingresar al taller/i })).toBeInTheDocument();

    const registerLink = screen.getByRole("link", { name: /crear cuenta/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute("href", "/admin/register");

    const backLinks = screen.getAllByRole("link", { name: /volver al inicio/i });
    expect(backLinks[0]).toHaveAttribute("href", "/");
  });

  it("muestra el mensaje de éxito cuando proviene de un registro exitoso (?registered=1)", () => {
    searchParamsMock = new URLSearchParams("registered=1");
    render(<AdminLoginPage />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /¡cuenta creada con éxito! por seguridad, ingresá con tu email y contraseña para acceder al panel/i
    );
  });
});

describe("AdminRegisterPage (Registro administrativo)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza el formulario de registro y el enlace para volver a iniciar sesión", () => {
    render(<AdminRegisterPage />);

    expect(screen.getByRole("heading", { name: /crear cuenta administrativa/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre y apellido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmar contraseña/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/código de invitación/i)).toBeInTheDocument();

    const loginLink = screen.getByRole("link", { name: /iniciar sesión/i });
    expect(loginLink).toBeInTheDocument();
    expect(loginLink).toHaveAttribute("href", "/admin/login");

    const backLinks = screen.getAllByRole("link", { name: /volver al inicio/i });
    expect(backLinks[0]).toHaveAttribute("href", "/");
  });
});

