# Alcance

### 1.1 Pasos de la plantilla nueva

Plantilla: código `REMATE_JUDICIAL`, nombre «Remate judicial», **versión 1**, `status = 'PUBLISHED'`, `is_active = TRUE`, `deadline_day_kind = 'BUSINESS'` (ADR 0010).

Flujo **lineal**: cada paso depende solo del anterior (12 dependencias). Plazo de todos los pasos: `TASK_ACTIVATED_AT`, 3 días, 0 minutos (valor provisorio de N2).

Las celdas marcadas con **(D3)** o **(D4)** son una propuesta que debe confirmarse antes de programar.

| Orden | Código                                  | Nombre visible                                                     | Rol responsable    | Evidencia          | Equivale en v3 a                                                                    |
| ----- | ---------------------------------------- | ------------------------------------------------------------------ | ------------------ | ------------------ | ----------------------------------------------------------------------------------- |
| 1     | `ACCEPT_PROPERTY`                      | Aceptar propiedad                                                  | `ADMIN`         | No                 | — (nuevo)                                                                          |
| 2     | `ASSIGN_MANAGER_AND_BIDDER`            | Asignar gestor y postor                                            | `ADMIN`          | No                 | mismo código (**no cambiar**, I1)                                            |
| 3     | `LEGAL_REVIEW`                         | Revisión legal                                                    | `LEGAL_REVIEWER` | No                 | `PRE_DELIVERY_LEGAL_REVIEW` (cambia de posición)                                 |
| 4     | `GENERATE_VALE_VISTA_LETTER`           | Generar carta Vale Vista                                           | `ADMIN`          | No                 | mismo código                                                                       |
| 5     | `SEND_LETTER_TO_GENERAL_MANAGER`       | Enviar carta al gerente general                                    | `ADMIN`          | No                 | mismo código                                                                       |
| 6     | `SEND_LETTER_TO_BANK`                  | Gerente general envía carta al banco                              | `ADMIN`          | No                 | mismo código                                                                       |
| 7     | `PREPARE_SUBMISSION_FORM`              | Generar formulario                                                 | `MANAGER`        | No                 | mismo código                                                                       |
| 8     | `COLLECT_VALE_VISTA`                   | Retirar Vale Vista                                                 | `MANAGER`        | Sí (formulario A) | mismo código                                                                       |
| 9     | `CONSIGN_GUARANTEE`                    | Consignar garantía                                                | `MANAGER`       | No                 | — (nuevo)                                                                          |
| 10    | `DELIVER_TO_COURT_AND_RECORD_EVIDENCE` | Entregar Vale Vista y formulario al tribunal y registrar evidencia | `MANAGER`        | Sí (formulario B) | une `DELIVER_VALE_VISTA_AND_FORM` + `RECORD_DELIVERY_EVIDENCE`                  |
| 11    | `FINAL_LEGAL_REVIEW`                   | Revisión legal final                                              | `LEGAL_REVIEWER` | No                 | mismo código                                                                       |
| 12    | `PREPARE_PARTICIPATION_AND_ALERTS`     | Alertas y preparar participación                                  | `BIDDER`        | No                 | une `PRE_AUCTION_ALERTS` (ADMIN) + `PREPARE_PARTICIPATION` (BIDDER)             |
| 13    | `PARTICIPATE_AND_RECORD_RESULT`        | Ingresar, participar y registrar remate                            | `BIDDER`         | Sí (formulario C) | une `ENTER_VIRTUAL_ROOM` + `PARTICIPATE_IN_AUCTION` + `RECORD_AUCTION_RESULT` |

Formularios de evidencia: copiar **los mismos campos** que hoy tiene `DEFAULT_EVIDENCE_FORMS` en [evidence-forms.ts](../apps/api/src/modules/workflow/domain/evidence-forms.ts). Los formularios definitivos dependen de N3 y quedan fuera de esta historia.

- **A** = campos de `COLLECT_VALE_VISTA` (banco, N° de Vale Vista, monto).
- **B** = campos de `RECORD_DELIVERY_EVIDENCE` (fecha de entrega, recibido por, observaciones).
- **C** = campos de `RECORD_AUCTION_RESULT` (resultado, monto adjudicado, observaciones).

Las descripciones de cada tarea se escriben en español, en una frase, siguiendo el estilo del seed `0002`.

# 2. Consideraciones adicionales

El motor del workflow es lineal, esto sigue siendo así, solo una tarea a la vez independiente de los responsables cada tarea previa es bloqueante para las siguientes

El borrado de versiones de workflows, sus tareas, instancias e historial es aceptable porque no hay qa ni producción, 

# 3. Criterios de Aceptación

01 borrado mediante script debe ser mediante transaccion, asi si una sentencia falla no se borra nada, no debe afectar a users, properties, roles, holidays.

02 solo una plantilla activa 

03 plantilla con trece tareas del flujo, con los códigos, nombres, roles y orden propuesto de 12 dependencias en cadena lineal

04 Ejecutar el seed dos veces no duplica plantilla, tareas ni dependencias.

05 Un workflow nuevo queda con el conjunto de reglas de notificación de la plantilla.

06 Después del borrado y una sincronización, se crea un workflow con la plantilla nueva para cada propiedad aceptada con remate de hoy o futuro. Las de remate pasado aparecen en «Propiedades sin workflow».

07 Un workflow puede recorrerse completo, del paso 1 al 13, completando cada tarea con su responsable, y termina en `COMPLETED`.

08 El editor de flujos (pantalla de plantillas) abre la plantilla nueva, muestra los 13 pasos en orden y permite crear un borrador a partir de ella.

09 `npm run typecheck`, `npm run lint` y `npx vitest run` pasan en `apps/api`, si no es así debe informarse.

10 npx ng test --watch=false`pasa en`apps/web`. si no es así debe informarse.

# 4. Errores Comunes a evitar

- [ ] ¿Usaste exactamente `ASSIGN_MANAGER_AND_BIDDER`? Un error de tipeo no rompe ninguna prueba de compilación, pero sí el motor.
- [ ] ¿El JSON de `evidence_form` es válido según `evidenceFormSchema` (nombres en camelCase, `CHOICE` con opciones, sin `;`)?
- [ ] ¿El seed de la plantilla corre **antes** que `0005_notification_rules.sql`?
- [ ] ¿El script de borrado dice `DESTRUCTIVO` en el encabezado y nunca menciona bases de QA ni de producción?
- [ ] ¿Hiciste el respaldo local antes de ejecutar el borrado?
- [ ] ¿Ninguna consulta escribe en `admin_new`?
- [ ] ¿`sql/workflow_mvp.sql` necesita regenerarse? Si es así, avísalo en el PR: no lo regeneres sin preguntar.
