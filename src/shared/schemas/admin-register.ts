import { z } from "zod";

export const adminRegisterSchema = z
  .object({
    displayName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120),
    email: z.string().trim().toLowerCase().email("El formato de correo no es válido.").max(254),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
  })
  .strict();

export type AdminRegisterCommand = z.infer<typeof adminRegisterSchema>;

