import { z } from 'zod';

/**
 * Schema para IDs generados con CUID.
 * Soporta CUID v1 y CUID v2 para máxima interoperabilidad.
 */
export const cuidSchema = z.union([
  z.string().cuid(),
  z.string().cuid2(),
]);

/**
 * Schema para UUIDs v4
 */
export const uuidSchema = z.string().uuid();

/**
 * Schema para fechas ISO 8601
 */
export const isoDateSchema = z.string().datetime();

/**
 * Schema para Decimales (dinero, horas, kilometraje)
 */
export const decimalSchema = z.union([
  z.string().regex(/^\d+(\.\d{1,2})?$/),
  z.number(),
]).transform((val) => {
  if (typeof val === 'string') {
    return parseFloat(val);
  }
  return val;
});

/**
 * Schema para strings no vacíos
 */
export const nonEmptyStringSchema = z.string().min(1, 'El campo es obligatorio');

/**
 * Schema para strings con longitud máxima
 */
export const maxLengthStringSchema = (max: number) => 
  z.string().max(max, `Máximo ${max} caracteres`);

/**
 * Schema para patentes vehiculares
 */
export const plateSchema = z
  .string()
  .regex(/^[A-Z0-9]{6,7}$/, 'Patente inválida. Use formato AAA111 o AA111AA')
  .transform((val) => val.toUpperCase());

/**
 * Schema para años de vehículos
 */
export const vehicleYearSchema = z
  .number()
  .int()
  .min(1950, 'Año mínimo: 1950')
  .max(new Date().getFullYear() + 1, 'Año máximo: próximo año');

/**
 * Schema para odómetro (kilometraje)
 */
export const odometerSchema = z
  .number()
  .int()
  .min(0, 'El kilometraje no puede ser negativo');

/**
 * Schema para tipos de vehículos
 */
export const vehicleTypeSchema = z.enum(['AUTO', 'CAMIONETA', 'CAMION', 'MOTO']);
export type VehicleType = z.infer<typeof vehicleTypeSchema>;

/**
 * Schema para estados de orden de trabajo
 */
export const workOrderStatusSchema = z.enum([
  'INGRESADO',
  'DIAGNOSTICO',
  'ESPERANDO_REPARACION',
  'EN_REPARACION',
  'CONTROL',
  'LISTO',
  'ENTREGADO',
  'CANCELADA',
]);
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

/**
 * Schema para estados de repuestos
 */
export const partStatusSchema = z.enum([
  'PENDIENTE',
  'SOLICITADO',
  'CONSEGUIDO',
  'RECIBIDO',
  'INSTALADO',
  'DEVOLUCION_PENDIENTE',
  'DEVUELTO',
  'CANCELADO',
]);
export type PartStatus = z.infer<typeof partStatusSchema>;

/**
 * Schema para tipos de bloqueadores (Gate A1)
 */
export const blockerTypeSchema = z.enum([
  'APROBACION_PRESUPUESTO',
  'REPUESTO_PENDIENTE',
  'AUTORIZACION_TRABAJO_ADICIONAL',
  'CONTROL_CALIDAD_RECHAZADO',
  'CAPACIDAD_TALLER',
  'DOCUMENTACION_VEHICULO',
  'ESPERA_DECISION_CLIENTE',
  'PAGO_PENDIENTE',
  'OTRO',
]);
export type BlockerType = z.infer<typeof blockerTypeSchema>;

/**
 * Schema para roles de usuario
 */
export const userRoleSchema = z.enum([
  'OWNER',
  'TALLER_SUPERVISOR',
  'MECANICO',
  'RECEPCIONISTA',
  'ADMIN',
]);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Schema para validación de Idempotency-Key header
 */
export const idempotencyKeySchema = z.string().uuid();

/**
 * Schema para paginación
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

/**
 * Schema para filtros comunes
 */
export const commonFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  fromDate: isoDateSchema.optional(),
  toDate: isoDateSchema.optional(),
});
