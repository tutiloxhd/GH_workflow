# ADR 0008 — Notificaciones internas y cola relacional

- **Estado:** Aceptada
- **Fecha:** 2026-11-18
- **Ámbito:** `apps/api/src/modules/notifications`, worker, scheduler y Angular

## Contexto

El workflow necesita avisos de asignación, recordatorio, escalamiento preventivo y vencimiento. El volumen esperado es de aproximadamente 20 workflows por semana. El ambiente no dispone de Redis, RabbitMQ ni SMTP y se priorizan costo y simplicidad operativa sin perder trabajos ante reinicios.

## Decisión

Las reglas, outbox, jobs y notificaciones internas se conservan en MariaDB. Los eventos de outbox se insertan en la misma transacción que los cambios y el historial del workflow. Un worker materializa los eventos y un scheduler independiente reclama jobs mediante bloqueos de fila y leases recuperables.

La entrega es al menos una vez y la unicidad de base impide materializaciones duplicadas. SSE solo informa que cambió el estado; Angular recupera el estado autoritativo por HTTP y mantiene polling de respaldo.

Política inicial:

- Solo el titular recibe asignaciones, recordatorios y vencimientos.
- Recordatorio 48 horas antes del vencimiento.
- Escalamiento a usuarios activos ADMIN y LEGAL_REVIEWER 24 horas antes.
- La suspensión cancela programaciones; la reanudación las regenera sin congelar tiempo.
- Reasignaciones y cambios de plazo cancelan y regeneran jobs pendientes.
- El vencimiento no cambia el estado ni bloquea el workflow.
- Las notificaciones se conservan después de ser leídas.
- No se implementa correo hasta disponer de SMTP o proveedor aprobado.

## Alternativas consideradas

- **BullMQ + Redis:** facilita delays y reintentos, pero agrega infraestructura y no elimina la necesidad de outbox.
- **RabbitMQ:** ofrece mensajería madura, pero su complejidad operativa no es proporcional al volumen actual.
- **Polling dentro de la API:** más simple, pero mezcla el ciclo de vida HTTP con procesos recuperables y críticos.

## Consecuencias

- API, sincronizador, worker y scheduler se ejecutan como procesos separados.
- MariaDB es la única fuente de verdad y debe respaldar las tablas nuevas.
- Los procesos pueden reiniciarse sin perder trabajo.
- Si el volumen creciera significativamente, el outbox permite publicar posteriormente en una cola externa sin acoplar el dominio a ella.
- El canal de correo requerirá un ADR y aprobación de dependencia/proveedor antes de incorporarse.
