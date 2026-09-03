---
name: async-systems
description: Tareas en segundo plano, colas de mensajes, recordatorios programados y Outbox pattern.
---

# Async Systems Skill — OS-CAR

Esta skill define el tratamiento de operaciones asíncronas y tareas en diferido en OS-CAR.

## 1. Casos de Uso Asíncronos
1. **Recordatorios de Mantenimiento Preventivo**: Cron job diario que evalúa vehículos con services realizados hace 6 o 12 meses (o proyección de kilometraje estimado) y despacha sugerencias de revisión al cliente.
2. **Generación de PDFs Pesados**: Compilación de presupuestos con múltiples fotos periciales en alta resolución fuera del hilo principal de la petición HTTP.
3. **Despacho de Notificaciones**: Encolamiento de mensajes de WhatsApp y correos electrónicos para no demorar la respuesta de la Server Action al usuario.

## 2. Patrón Transaccional Outbox
Para garantizar que nunca se envíe un mensaje si la transacción de base de datos falló (y viceversa):

```text
[ Server Action ] 
       ↓ (Dentro de la misma transacción interactiva de Prisma)
1. Actualiza RepairOrder a 'READY_FOR_PICKUP'
2. Inserta registro en tabla 'OutboxMessage' (canal: WHATSAPP, payload, status: PENDING)
       ↓ (Commit de la transacción)
[ Background Worker / Cron Job ]
       ↓
Lee mensajes PENDING con bloqueo selectivo (`FOR UPDATE SKIP LOCKED`)
Envía a API de WhatsApp
Marca como SENT o programa reintento con backoff exponencial
```

## 3. Idempotencia y Reintentos
- Todo job o worker asíncrono debe ser estrictamente idempotente.
- El identificador único del mensaje (`idempotencyKey`) se deriva de `orderId + targetState` para evitar despachar dos veces la misma notificación ante reintentos de red.
