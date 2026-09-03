# Integrations Context — OS-CAR

## External Services & Drivers
1. **Neon PostgreSQL**: Base de datos relacional serverless con escalabilidad automática y conexión segura SSL.
2. **Resend / Email**: Envío transaccional de presupuestos en PDF, órdenes de entrega y comprobantes fiscales.
3. **WhatsApp Business API / Twilio**: Envío de avisos automatizados al cliente:
   - "Su vehículo [Patente] ha ingresado al taller."
   - "El presupuesto de su vehículo está listo para revisión: [Enlace Seguro]."
   - "Su vehículo ya está listo para ser retirado."
4. **VIN Decoding Services (NHTSA / Carfax / Custom DB)**: Autocompletado de marca, modelo, año, cilindrada y especificaciones técnicas al ingresar el VIN del vehículo.
5. **Pasarela de Pagos (MercadoPago / Stripe)**: Generación de links de pago para cancelación total o señas de repuestos.
6. **Almacenamiento de Archivos (AWS S3 / Cloudflare R2 / Cloudinary)**: Almacenamiento pericial de fotografías del vehículo en recepción y fotos de piezas sustituidas.

## Webhooks Handling Strategy
- Todos los webhooks entrantes deben validar su firma criptográfica (`HMAC-SHA256`) antes de procesar el body crudo (`req.text()`).
- Implementar idempotencia mediante tabla `ProcessedEvents` para evitar procesamiento duplicado de notificaciones de pago o mensajes.
