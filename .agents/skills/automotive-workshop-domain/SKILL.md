---
name: automotive-workshop-domain
description: Conocimiento profundo del dominio automotriz, flujo de taller, checklist pericial y cálculo financiero.
---

# Automotive Workshop Domain Skill — OS-CAR

Esta skill condensa el conocimiento especializado del negocio de talleres mecánicos y postventa automotriz para OS-CAR.

## 1. Ciclo de Vida de la Orden de Trabajo (OT)
La Orden de Trabajo (Work Order / OT) es la entidad central del taller. Su máquina de estados es estricta:

```text
[ Recepción ] ➔ DRAFT (Ingreso con checklist pericial, fotos y motivo de consulta)
      ↓
[ Diagnóstico ] ➔ DIAGNOSIS (Mecánico inspecciona vehículo y detecta fallas)
      ↓
[ Presupuestación ] ➔ PENDING_APPROVAL (Desglose de Mano de Obra y Repuestos enviado a cliente)
      ↓ (Cliente aprueba presupuesto vía link / WhatsApp)
[ Reparación ] ➔ IN_PROGRESS (Mecánico ejecuta tareas; repuestos descontados de pañol)
      ↓
[ Control de Calidad ] ➔ QUALITY_CONTROL (Jefe de taller prueba vehículo y verifica checklist)
      ↓
[ Listo para Entrega ] ➔ READY_FOR_PICKUP (Aviso automático al cliente para retiro)
      ↓
[ Entrega ] ➔ DELIVERED (Firma de conformidad de retiro y entrega de llave)
      ↓
[ Facturación ] ➔ INVOICED (Emisión de factura o comprobante comercial y cobro)
```

## 2. Recepción Pericial del Vehículo (Check-in)
El check-in protege tanto al taller como al cliente frente a reclamos por daños preexistentes:
1. **Identificación Obligatoria**:
   - Patente / Placa (normalizada en mayúsculas).
   - Kilometraje actual (odómetro) — advertir si es inferior al registro anterior.
   - Nivel de combustible (selector gráfico de 0%, 25%, 50%, 75%, 100%).
2. **Checklist Visual de Carrocería**:
   - Diagrama interactivo del auto (4 vistas: frontal, trasera, laterales y techo).
   - Registro de golpes, rayas, cristales rajados y estado de neumáticos.
   - Almacenamiento de fotografías tomadas en el momento.
3. **Inventario de Objetos en Vehículo**:
   - Rueda de auxilio presente (Sí/No).
   - Crique / Gato y llave de ruedas (Sí/No).
   - Documentación en guantera / estéreo / objetos de valor declarados.

## 3. Desglose Estricto: Mano de Obra vs. Repuestos
El pilar de transparencia de OS-CAR exige separar radicalmente ambos conceptos:
- **Mano de Obra (Labor)**:
  - Definida por tiempo estimado en horas (ej: 1.5 hs) y tarifa por hora configurada por el taller ($/hora).
  - Trazable al mecánico o especialista asignado.
  - Permite evaluar la eficiencia del taller (Horas vendidas vs Horas reales empleadas).
- **Repuestos (Spare Parts)**:
  - Cada pieza incluye: Código de parte (SKU/OEM), descripción, cantidad, costo de adquisición del taller y precio de venta al público (con margen de marcación aplicado).
  - Estado del repuesto: `EN_STOCK`, `PEDIDO_A_PROVEEDOR`, `RECIBIDO`, `INSTALADO`.

## 4. Retiro y Devolución de Piezas Viejas
Por norma de transparencia, las piezas sustituidas (filtros, bujías, correas, pastillas) deben colocarse en una caja en el baúl del auto para ser exhibidas al cliente al momento de la entrega, a menos que el cliente renuncie explícitamente a recibirlas.
