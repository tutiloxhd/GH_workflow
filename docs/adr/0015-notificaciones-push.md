# ADR 0015 — Notificaciones Web Push

- **Estado:** Aceptada por el usuario el 2026-11-26. Implementación pendiente de migración y configuración.
- **Fecha:** 2026-11-26.
- **Ámbito:** PWA Angular, módulo de notificaciones, worker y MariaDB.

## Contexto

La PWA ya se instala en Android y escritorio. Las notificaciones internas se guardan
en `notifications` y se actualizan en la interfaz mediante SSE y polling, pero no
avisan cuando la aplicación está cerrada. La misma persona puede instalarla en
varios dispositivos. El ADR 0008 conserva MariaDB como fuente de verdad y separa
los efectos externos de las transacciones del workflow.

## Decisión

1. Mantener las reglas, destinatarios e historial actuales. Web Push será un canal
   adicional para cada notificación interna materializada, sin crear nuevos eventos
   de negocio ni cambiar los plazos.
2. Solicitar permiso solo después de una acción explícita del usuario. Mostrar en
   la interfaz si el navegador no admite push, si el permiso fue denegado y si la
   suscripción está activa. Cada usuario podrá desactivar push en ese dispositivo.
3. Usar `SwPush` de Angular y un par de claves VAPID por ambiente. La clave pública
   se entrega al cliente; la privada queda únicamente en configuración segura del
   backend. No se registran claves ni endpoints completos en logs.
4. Persistir una suscripción por endpoint y usuario, con claves de cifrado,
   fechas de creación/actualización y revocación. El endpoint se valida y se
   asocia a la sesión autenticada, nunca al `userId` enviado por el cliente.
   Cerrar sesión desactiva la suscripción de ese dispositivo. Una respuesta 404 o
   410 del servicio push la invalida.
5. Encolar la entrega por notificación y suscripción con clave única para evitar
   duplicados al reintentar. El worker reclama entregas con lease, timeout,
   máximo de intentos y backoff. La llamada de red ocurre después del commit.
   El resultado de push no altera la notificación interna ni la marca como leída.
6. El mensaje visible será genérico para evitar mostrar datos del remate en la
   pantalla bloqueada. Al tocarlo se abre la aplicación; la sesión y la
   autorización vigentes determinan qué información puede verse.
7. Añadir endpoints autenticados para obtener la clave pública, registrar o
   reemplazar la suscripción del dispositivo y revocarla. Documentarlos en OpenAPI.
   Preparar migración versionada, pruebas con suscripciones sintéticas y un
   adaptador de entrega sustituible en pruebas. No ejecutar migraciones ni enviar
   mensajes reales durante la implementación inicial.
8. La primera versión admite endpoints de FCM usados por Chrome y WNS usados
   por Edge. La API rechaza destinos distintos para evitar solicitudes
   arbitrarias desde el worker.
   Firefox y Safari requerirán ampliar la lista de servicios permitidos con pruebas.

## Dependencia propuesta

`web-push` en `apps/api` para VAPID, cifrado del payload y entrega HTTP. No se
requiere una dependencia frontend nueva: `@angular/service-worker` ya está
instalada. La alternativa sin `web-push` es implementar y mantener el protocolo,
la firma y el cifrado de Web Push con primitivas de Node, con mayor complejidad y
riesgo de errores. La librería añade una dependencia al runtime del worker; debe
fijarse a una versión compatible, auditarse y actualizarse con el resto del backend.

## Alternativas consideradas

- Reutilizar SSE: solo funciona con la aplicación abierta y conectada.
- Usar un servicio de push propietario: agrega cuenta, costo y dependencia externa.
- Enviar push directamente al materializar la notificación: dificulta reintentos y
  puede perder entregas si el proceso se interrumpe.

## Consecuencias y límites

- Las suscripciones son por dispositivo y pueden expirar o cambiar; debe existir
  reconciliación al abrir la aplicación.
- La entrega es al menos una vez. No se promete que el sistema operativo muestre
  cada aviso ni que llegue de inmediato.
- Push requiere origen seguro, permiso del usuario y conectividad del dispositivo.
- La nueva cola y suscripciones requieren migración SQL revisable y aprobación
  separada antes de ejecutarla.
