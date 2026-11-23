# ADR 0013: Asignación de participantes desde admin_new

- **Estado:** aceptado (2026-11-23)
- **Ámbito:** sincronización de propiedades y participantes del workflow.

## Contexto

`estado_remate` entrega `pagador`, `postor`, `rut_pagador` y `rut_postor`, pero no entrega
`id_user`. Workflow necesita asociar esos datos con cuentas importadas sin mostrar un nombre de
origen como si fuera una asignación efectiva.

## Decisión

- La fila más reciente de `estado_remate` vinculada al ID de propiedad tiene prioridad sobre la
  vinculada al ID del registro de remate; esta última se usa cuando no existe la primera.
- Si el RUT del pagador o postor está informado, se busca una única cuenta activa con el rol
  correspondiente y el mismo RUT normalizado. Esa asignación explícita puede corresponder a un
  agente sin región cargada. Si no hay RUT, se usa la coincidencia exacta y única por nombre y se
  conserva la validación de región y modalidad.
- Cuando se resuelven gestor y postor, se asigna por defecto el usuario local ID 9, Pablo Godoy,
  como `LEGAL_REVIEWER`, siempre que esté activo y conserve ese rol. No se reemplaza un revisor
  legal ya asignado.
- La tarea `ASSIGN_MANAGER_AND_BIDDER` se completa por sistema cuando ambos titulares coinciden
  con el origen. En workflows activos existentes se completan asignaciones faltantes mientras esa
  tarea esté `READY`; el revisor legal por defecto también puede agregarse después si falta.
- La interfaz muestra los participantes efectivamente asignados. El formulario no muestra el RUT
  ni los nombres crudos de `admin_new` junto al selector.

## Alternativas consideradas

- Vincular directamente por `admin_new.id_user`: `estado_remate` no contiene ese identificador.
- Mostrar el nombre de origen como titular aunque no exista una cuenta asociada: confundía un dato
  descriptivo con una asignación real.

## Consecuencias

- Un RUT de origen incorrecto o ambiguo impide la asignación automática de ese rol; queda la tarea
  pendiente para revisión manual.
- El ID local 9 es específico del ambiente actual. Si no corresponde a Pablo Godoy con rol legal,
  no se aplica el revisor por defecto.
- La sincronización conserva responsables ya asignados y registra los cambios que aplica.
