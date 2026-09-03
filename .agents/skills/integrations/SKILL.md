---
name: integrations
description: Integraciones externas para OS-CAR (WhatsApp, Resend, VIN Decoder, Pagos, Webhooks).
---

# Integrations Skill — OS-CAR

Esta skill norma la conexión y el manejo de servicios externos en el ecosistema OS-CAR.

## 1. Notificaciones por WhatsApp Business API
Para mantener informado al cliente sin saturar la atención telefónica del taller:
- **Eventos Notificados**:
  1. *Ingreso de Vehículo*: Confirmación de recepción con código de OT y resumen de checklist.
  2. *Presupuesto Listo*: Enlace web protegido para visualizar el desglose y aprobar con un click.
  3. *Vehículo Listo*: Notificación de finalización de trabajos, monto final e indicaciones de retiro.
- **Formato de Enlace Seguro**: `https://oscar.app/portal/orders/{orderId}?token={secureHmacToken}`

## 2. Decodificador de VIN (Vehicle Identification Number)
Al registrar un vehículo, consultar la API de decodificación para autocompletar atributos técnicos:
- Marca (Make)
- Modelo (Model)
- Año de Fabricación (Model Year)
- Tipo de Motorización / Combustible
- Cilindrada y Código de Motor

Si la API externa falla o no responde en 1.5s, degradar grácilmente permitiendo al asesor escribir los datos de forma manual sin bloquear el flujo.

## 3. Envío de Presupuestos y Facturas por Correo (Resend)
- Generación de PDF en servidor con el membrete del taller, desglose contable de Mano de Obra y Repuestos, y firma digital.
- Envío mediante `Resend` con adjunto optimizado (<2MB) y registro de delivery status (`DELIVERED`, `BOUNCED`, `OPENED`).

## 4. Webhooks y Resiliencia
- Todo endpoint de webhook (`/api/v1/webhooks/*`) debe validar la firma criptográfica en el header antes de procesar el body.
- Guardar el evento en tabla `WebhookEvent` con estado `PENDING` antes de su procesamiento para garantizar tolerancia a fallos y reintentos idempotentes.
