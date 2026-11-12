# AGENTS.md

## 1. Propósito y alcance

Este archivo contiene las reglas obligatorias para cualquier agente de inteligencia artificial que trabaje en este repositorio.

Se aplica a todo el repositorio, salvo que exista un AGENTS.md más específico dentro de un subdirectorio. Un archivo anidado puede agregar instrucciones propias de un módulo, pero no puede reducir silenciosamente las restricciones de seguridad, protección de datos, aprobaciones o control de cambios establecidas aquí.

Orden de prioridad:

1. Instrucciones explícitas del usuario para la tarea actual.
2. Este archivo y los AGENTS.md anidados aplicables.
3. Decisiones de arquitectura aprobadas y documentación vigente.
4. Convenciones existentes del código.

Si dos fuentes autorizadas se contradicen y el conflicto afecta comportamiento, datos, seguridad, arquitectura o sistemas externos, el agente debe detener esa parte del trabajo, explicar el conflicto y solicitar una decisión.

## 2. Contexto del producto

El producto administra el workflow operacional de remates judiciales.

Debe permitir:

- Leer propiedades aceptadas desde el sistema externo admin_new.
- Crear instancias desde plantillas versionadas.
- Administrar tareas manuales y automáticas.
- Soportar dependencias, paralelismo y ramas.
- Asignar responsables y suplentes.
- Calcular vencimientos desde fechas de negocio.
- Suspender, reanudar, cancelar y reprogramar.
- Ejecutar documentos, alertas y notificaciones.
- Mantener autorización, historial y auditoría completa.
- Adoptar la maqueta existente como referencia visual y funcional.

La dificultad principal está en las reglas de negocio, concurrencia, automatizaciones, integraciones y trazabilidad.

## 3. Stack y arquitectura aprobados

### Frontend

- Angular.
- TypeScript.
- La maqueta existente es la referencia visual; no se rediseña sin solicitud explícita.

### Backend

- Node.js como runtime.
- Express como framework HTTP.
- TypeScript.
- API REST documentada mediante OpenAPI.
- MySQL o MariaDB según el ambiente aprobado.

Express debe implementarse de forma estructurada. No se acepta un backend organizado únicamente como una colección de rutas, middleware y consultas SQL.

### Arquitectura general

- Monolito modular.
- Separación conceptual entre frontend, API, worker y scheduler.
- Organización por capacidades de negocio.
- Casos de uso explícitos para operaciones del workflow.
- Separación entre tareas de negocio y jobs técnicos.
- Plantillas versionadas separadas de sus instancias.

No se introducen microservicios, CQRS, event sourcing, BPMN externo o infraestructura distribuida sin comunicar previamente la decisión y obtener aprobación.

## 4. Material de referencia

- references/demoweb/: referencia visual y de interacción; no es arquitectura productiva.
- references/motor/: prueba conceptual; no es automáticamente código productivo.
- references/docs/: antecedentes funcionales y técnicos; puede contener supuestos pendientes.

Todo references/ es de solo lectura para los agentes, salvo solicitud explícita del usuario para modificarlo.

Los agentes pueden leerlo y analizarlo sin permiso adicional. Una referencia marcada como pendiente, supuesto, simulación o propuesta no equivale a una decisión aprobada.

## 5. Reglas generales de trabajo

Los agentes pueden:

- Leer y analizar archivos.
- Ejecutar inspecciones no destructivas.
- Usar Git en modo lectura.
- Crear o modificar archivos dentro de la tarea solicitada.
- Crear pruebas relacionadas.
- Actualizar documentación afectada.
- Ejecutar herramientas ya instaladas de formato, lint, tipos, pruebas y build.
- Consultar bases locales únicamente en modo lectura.

Los agentes deben:

- Leer estas instrucciones antes de actuar.
- Revisar código y convenciones cercanas antes de editar.
- Preservar cambios del usuario y modificaciones no relacionadas.
- Mantener los cambios dentro del objetivo solicitado.
- Preferir el cambio coherente más pequeño.
- Explicar supuestos relevantes.
- Verificar proporcionalmente al riesgo.
- Informar pruebas ejecutadas y no ejecutadas.
- Comunicar cualquier decisión o cambio de arquitectura antes de implementarlo.
- Esperar aprobación del usuario que dirige la tarea.
- No afirmar que algo fue probado, aprobado o desplegado si no lo fue.

## 6. Dependencias

Está prohibido instalar, eliminar o actualizar dependencias sin autorización previa y explícita.

Esto incluye:

- npm install, npm add, npm update y equivalentes.
- Dependencias productivas o de desarrollo.
- Herramientas globales.
- Paquetes del sistema operativo.
- Imágenes, servicios o plugins de infraestructura.

Antes de pedir autorización, el agente debe indicar:

1. Qué dependencia necesita.
2. Para qué se necesita.
3. Qué alternativa existe sin ella.
4. Qué impacto tendrá en runtime, mantenimiento y seguridad.

La autorización para una dependencia no autoriza otras. Se pueden ejecutar dependencias que ya estén instaladas y configuradas.

## 7. Git

Los agentes tienen prohibido:

- Crear commits.
- Crear, eliminar o cambiar ramas.
- Crear tags.
- Ejecutar git push.
- Abrir pull requests o releases.
- Reescribir historial.
- Descartar cambios del usuario.

Todos los cambios deben quedar sin commit para revisión humana.

Se permite Git solo en modo lectura: git status, git diff, git log y git show. El agente debe revisar el estado antes y después de cambios materiales.

## 8. Acciones que requieren aprobación previa

El agente debe comunicar la propuesta y esperar aprobación antes de:

- Tomar o cambiar una decisión de arquitectura.
- Cambiar framework, runtime, base, ORM, autenticación, cola, scheduler, almacenamiento o despliegue.
- Cambiar la estructura general de módulos.
- Inicializar aplicaciones completas o generar scaffolds.
- Agregar, eliminar o actualizar dependencias.
- Introducir Redis, RabbitMQ, Kafka, Elasticsearch, Kubernetes u otra infraestructura.
- Crear o modificar CI/CD, recursos cloud o configuración productiva.
- Ejecutar cualquier escritura en una base de datos.
- Ejecutar migraciones o seeds.
- Conectarse a bases remotas, QA o productivas.
- Consultar datos reales sensibles.
- Enviar correos, mensajes o solicitudes reales externas.
- Cambiar pasos, dependencias, plazos, roles, permisos o ramas del workflow.
- Modificar references/.
- Realizar acciones destructivas o difíciles de revertir.

Una aprobación específica no autoriza acciones futuras o de mayor alcance.

## 9. Organización del backend Express

La implementación debe separar transporte HTTP, aplicación, dominio e infraestructura sin crear abstracciones innecesarias.

La estructura concreta de carpetas y sus nombres no está definida por este documento. Debe proponerse, comunicarse y aprobarse antes de inicializar el backend o realizar una reorganización material.

El siguiente árbol es únicamente un ejemplo ilustrativo de separación de responsabilidades. Sus nombres, niveles, módulos y ubicación no establecen el orden definitivo del proyecto:

```text
src/
  <composición-de-la-aplicación>/
  <módulos-de-negocio>/
    <módulo-a>/
    <módulo-b>/
  <adaptadores-o-infraestructura>/
    <persistencia>/
    <procesos-en-segundo-plano>/
    <integraciones-externas>/
  <capacidades-compartidas>/
  <puntos-de-entrada>/
```

Este ejemplo no obliga a usar carpetas llamadas modules, infrastructure, shared, app o entrypoints. Tampoco obliga a separar cada responsabilidad en una carpeta distinta. La estructura aprobada debe ser la más sencilla que mantenga límites claros, cohesión alta y dependencias comprensibles.

### Routes y controllers

- Definen transporte HTTP.
- Leen parámetros, sesión y payload validado.
- Invocan un caso de uso.
- Transforman resultados en respuestas.
- No contienen reglas de negocio ni SQL.

### Schemas y validación

- Validan toda entrada externa.
- Definen formatos, límites y campos permitidos.
- Rechazan campos desconocidos cuando corresponda.
- No sustituyen invariantes del dominio.

### Casos de uso

- Coordinan transacciones.
- Cargan los datos necesarios.
- Aplican autorización contextual.
- Invocan reglas del dominio.
- Guardan cambios, historial y jobs.
- No dependen de objetos HTTP de Express.

Ejemplos ilustrativos de operaciones que podrían modelarse como casos de uso, sin definir todavía sus nombres ni su distribución definitiva:

```text
StartWorkflow
CompleteTask
SuspendWorkflow
SelectOutcome
RecalculateDeadlines
```

Estos nombres son ejemplos conceptuales. No se deben copiar como convención obligatoria ni utilizar para inferir que el catálogo completo de casos de uso ya fue aprobado.

### Dominio

- Contiene reglas, estados, invariantes y transiciones.
- No depende de Express, HTTP ni detalles de base de datos.
- No ejecuta correo, almacenamiento ni otros efectos externos.

### Infraestructura

- Implementa base, correo, almacenamiento, jobs, scheduler e integraciones.
- Debe poder sustituirse en pruebas cuando sea necesario.
- Transforma errores técnicos antes de exponerlos al cliente.

## 10. Configuración y secretos

La configuración variable por ambiente se obtiene desde variables de entorno.

- Se puede usar un .env local.
- .env nunca se versiona.
- No se escriben secretos reales en código, documentación, pruebas o logs.
- Debe existir un .env.example con nombres y valores ficticios.
- La aplicación valida variables obligatorias al iniciar.
- Desarrollo, QA y producción usan credenciales diferentes.
- Cambiar de ambiente no requiere modificar código.
- En producción se prefiere la inyección segura de secretos de la plataforma.
- Los agentes no copian credenciales entre ambientes.
- No se imprimen conexiones ni secretos completos.

Variables esperables:

```dotenv
NODE_ENV=
PORT=
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
ADMIN_NEW_DB_NAME=
```

Si hay conexiones diferentes, deben tener prefijos claros y separados.

## 11. Bases de datos y SQL

### Base local

Los agentes pueden conectarse a una base local configurada únicamente para lectura.

Permitido:

- Inspeccionar esquema y metadatos.
- Ejecutar SELECT.
- Ejecutar EXPLAIN sin efectos de escritura.
- Verificar datos sintéticos.

Prohibido sin aprobación:

- INSERT, UPDATE, DELETE o REPLACE.
- CREATE, ALTER, DROP o TRUNCATE.
- Migraciones o seeds.
- Crear usuarios o cambiar permisos.
- Restaurar o importar respaldos.
- Procedimientos con efectos de escritura.

Cuando una tarea necesite cambios de esquema o datos, el agente debe preparar SQL revisable en sql/, pero no ejecutarlo.

```text
sql/
  migrations/
  seeds/
  queries/
  diagnostics/
```

Los scripts deben indicar propósito y ambiente, evitar credenciales, ser idempotentes cuando sea posible, señalar efectos destructivos e incluir verificaciones cuando corresponda.

### Reglas de datos

- Usar migraciones versionadas.
- No modificar migraciones ya aplicadas en ambientes compartidos.
- Usar claves foráneas, restricciones únicas e índices.
- Usar transacciones y bloqueos de filas para concurrencia.
- Guardar dinero como entero en unidad menor o decimal fijo, nunca float.
- Preferir UTC internamente y convertir a America/Santiago en los límites.
- No usar JSON para sustituir campos relacionales relevantes.
- Añadir restricciones de idempotencia para sincronización y jobs.

### admin_new

- Es un sistema externo y de solo lectura.
- El sistema nuevo nunca escribe en admin_new.
- El acceso se encapsula detrás de un adaptador.
- El dominio no depende de nombres de tablas legacy.
- Se conserva identificador de origen y metadata de sincronización.
- La sincronización repetida no crea workflows duplicados.
- Datos incompletos o contradictorios se informan, no se completan silenciosamente.

## 12. Reglas del workflow

1. Definiciones e instancias son conceptos separados.
2. Una versión publicada es inmutable.
3. Las tareas se activan según dependencias.
4. Las transiciones son transaccionales.
5. El frontend no establece estados protegidos.
6. Toda acción relevante genera historial.
7. El estado operacional se deriva de tareas y reglas confirmadas.
8. La autorización se verifica en backend.

El agente no puede inventar reglas faltantes.

Siguen pendientes salvo aprobación posterior:

- Plazos marcados como “por definir”.
- Si revisiones legales bloquean o solo permiten suspender.
- Umbral exacto de alertas.
- Efecto de suspensión sobre plazos.
- Manejo de fechas u horas faltantes.
- Criterio para filas legacy duplicadas.
- Documentos que se generan automáticamente.
- Comportamiento completo de REPROGRAMADO.
- Mecánica de pago posterior a adjudicación.
- Destino de “Crear proyecto”.

Si una tarea toca una regla pendiente, el agente explica alternativas y solicita decisión antes de implementar.

## 13. Jobs, worker y scheduler

- Una tarea es un concepto de negocio; un job es un intento técnico.
- Deben modelarse por separado.
- Los jobs son persistentes, observables, reintentables e idempotentes.
- Cada job define máximo de intentos, backoff, timeout y fallo final.
- Debe existir recuperación de jobs abandonados.
- El scheduler dispara comandos o jobs; no contiene lógica central.
- Procesos críticos no dependen solo de setInterval dentro del servidor HTTP.
- Efectos externos no se ejecutan dentro de transacciones.
- No se llama a sistemas externos antes de confirmar el cambio que originó el efecto.
- Se evalúa transactional outbox cuando una transición deba causar un efecto confiable.
- API, worker y scheduler tienen puntos de entrada separados.

Redis u otro broker requiere una decisión aprobada. Para el MVP puede usarse una cola relacional persistente si cumple estas garantías.

## 14. API y frontend

- Usar endpoints explícitos para completar, suspender, reanudar, cancelar, reasignar, reintentar y elegir resultado.
- No exponer una actualización genérica de estados protegidos.
- Validar toda entrada en servidor.
- Devolver códigos estables o Problem Details.
- Mantener OpenAPI al comenzar la implementación.
- Generar o validar tipos Angular desde el contrato cuando sea práctico.
- Mantener la apariencia de la maqueta salvo solicitud de diseño.
- Considerar accesibilidad, teclado y foco.

## 15. Seguridad

Los agentes nunca deben:

- Guardar secretos, contraseñas, tokens o claves privadas.
- Usar datos productivos en pruebas, fixtures, capturas, prompts o logs.
- Desactivar autenticación, autorización, auditoría o validación.
- Exponer stack traces o información sensible.
- Usar localStorage como persistencia autoritativa.
- Registrar documentos legales o datos personales sin anonimización.
- Crear autenticación temporal destinada a producción sin aprobación.

Las pruebas usan datos sintéticos.

## 16. Pruebas

Todo cambio de comportamiento debe incluir pruebas proporcionales al riesgo.

El motor debe cubrir progresivamente:

- Inicio idempotente.
- Dependencias simples, múltiples y paralelas.
- Autorización.
- Concurrencia al completar tareas.
- Suspensión, reanudación y cancelación.
- Todas las ramas.
- Plazos y reprogramación.
- Fallo y reintento de automatizaciones.
- Recuperación de jobs.
- Sincronización repetida y duplicados.
- Datos faltantes.
- Versionado.
- Historial.
- Zona horaria.

No se borran, omiten o debilitan pruebas solamente para obtener un build exitoso.

## 17. Documentación y decisiones

Toda decisión importante se comunica antes de implementarse y debe ser aprobada por el usuario que dirige la tarea.

Después debe registrarse como ADR cuando corresponda. Se requiere ADR al menos para:

- Acceso a datos u ORM.
- Validación.
- Autenticación.
- Cola y scheduler.
- Almacenamiento documental.
- Versionado de workflows.
- Integración con admin_new.
- Despliegue.

Un ADR incluye contexto, decisión, alternativas, consecuencias y estado. Una propuesta no es una decisión aceptada.

## 18. Instrucciones por aplicación

Cuando existan aplicaciones productivas se debe agregar:

- Un AGENTS.md dentro del frontend Angular.
- Un AGENTS.md dentro del backend Express.

Cada uno debe concretar librerías aprobadas, estructura, comandos de verificación y convenciones propias sin contradecir este archivo.

## 19. Convenciones de nombres y código

Todo código nuevo o modificado debe seguir convenciones consistentes, nombres descriptivos y buenas prácticas de JavaScript, TypeScript y desarrollo de software en general.

Si una herramienta de lint o formato aprobada define una regla más específica, se debe respetar esa configuración. No se pueden instalar ni cambiar herramientas sin autorización.

### 19.1 Idioma de los nombres

- El código, nombres de archivos técnicos, identificadores, tipos, clases, funciones y variables se escriben en inglés.
- Los conceptos propios del negocio pueden conservar términos en español cuando no exista una traducción inequívoca o cuando el lenguaje ubicuo aprobado por negocio los utilice.
- No mezclar inglés y español para el mismo concepto.
- Los textos visibles para usuarios se escriben en español y deben quedar preparados para centralización o internacionalización cuando corresponda.
- Comentarios, documentación funcional y mensajes de decisiones pueden escribirse en español.

### 19.2 Convenciones de nombres

- Variables y funciones: camelCase.
- Clases, tipos, interfaces, enums y componentes: PascalCase.
- Constantes globales realmente inmutables: UPPER_SNAKE_CASE.
- Archivos y directorios: kebab-case, salvo convención oficial distinta del framework.
- Variables de entorno: UPPER_SNAKE_CASE.
- Tablas y columnas SQL: snake_case.
- Rutas HTTP: sustantivos en plural y kebab-case cuando haya más de una palabra.
- Los booleanos deben comenzar preferentemente con is, has, can, should, was o equivalente semántico.
- Las colecciones deben usar nombres plurales.
- Los handlers de eventos deben describir el evento o la intención, no el detalle visual.

Evitar:

- Abreviaturas ambiguas.
- Nombres genéricos como data, info, item, obj, temp, helper, manager o utils cuando exista un nombre de dominio más preciso.
- Nombres de una letra, excepto índices locales evidentes y de alcance mínimo.
- Reutilizar un mismo término para conceptos diferentes.
- Incluir el tipo técnico en el nombre si no aporta significado, por ejemplo userArray o taskObject.
- Nombres engañosos: una función llamada get no debe modificar estado y una función llamada validate no debe persistir datos.

### 19.3 Funciones y módulos

- Aplicar KISS: mantener la solución lo más sencilla posible y evitar complejidad que no resuelva una necesidad actual.
- Aplicar YAGNI: no agregar funcionalidades, clases, métodos, capas, configuraciones o puntos de extensión hasta que exista una necesidad concreta y aprobada.
- Aplicar DRY al conocimiento y a las reglas: cada regla de negocio debe tener una representación autoritativa y no repetirse en múltiples capas.
- No confundir DRY con abstracción prematura. Código parecido puede permanecer separado si representa conceptos distintos o si todavía no existe una abstracción estable.
- Aplicar responsabilidad única: cada función, clase o módulo debe encargarse de una sola responsabilidad reconocible y ejecutarla correctamente.
- Aplicar el principio de menor sorpresa: una función, clase o módulo debe comportarse como un desarrollador esperaría basándose en su nombre, tipo y contrato público.
- Las funciones deben ser breves, realizar una sola tarea y mantenerse en un nivel de abstracción coherente.
- Preferir funciones pequeñas y composición antes que funciones extensas con múltiples niveles de condiciones.
- Evitar parámetros booleanos que cambien radicalmente el comportamiento; preferir opciones nombradas o casos de uso distintos.
- Evitar efectos secundarios ocultos.
- No duplicar reglas de negocio entre frontend, rutas, jobs o servicios.
- Extraer código compartido solo cuando exista reutilización o una responsabilidad clara; no crear abstracciones especulativas.
- Mantener alta cohesión dentro de cada módulo y bajo acoplamiento entre módulos.
- Las dependencias deben apuntar hacia contratos o límites claros del módulo correspondiente.
- No crear archivos genéricos de helpers o utils como destino de lógica sin propietario.
- Evitar archivos excesivamente grandes; dividirlos por responsabilidad, no de manera arbitraria.
- Preferir early returns para reducir anidación cuando mejoren la lectura.
- Evitar condicionales anidados. Utilizar guard clauses, tablas de decisión, estrategias o funciones separadas cuando expresen mejor la intención.
- Preferir métodos declarativos como map, filter, find, some, every y reduce cuando comuniquen mejor la intención que un bucle imperativo.
- No forzar un estilo declarativo si vuelve el código menos claro, crea trabajo innecesario o dificulta el manejo correcto de asincronía y errores.
- Las reglas de negocio deben expresarse con nombres del dominio y no con números, strings o condiciones mágicas.
- Aplicar la regla del boy scout dentro del alcance de la tarea: dejar el código tocado ligeramente más claro, seguro o consistente que antes.
- La regla del boy scout no autoriza refactorizaciones amplias, cambios de arquitectura ni modificaciones no relacionadas.

### 19.4 JavaScript y TypeScript

- Usar TypeScript en todo código productivo nuevo del backend y frontend.
- Habilitar y conservar modo estricto cuando el proyecto sea inicializado.
- Evitar any. Si una integración obliga a usarlo, limitarlo al borde, justificarlo y convertirlo inmediatamente a un tipo seguro.
- Usar unknown para valores externos hasta validarlos.
- No confiar solamente en tipos de TypeScript para datos provenientes de HTTP, base de datos, archivos, colas o sistemas externos; validar en runtime.
- Preferir const. Usar let solo cuando la referencia deba reasignarse. No usar var.
- Preferir igualdad estricta === y !==.
- Usar desestructuración de objetos y arreglos cuando reduzca repetición y haga más clara la intención; evitarla cuando oculte el origen de los valores.
- Usar optional chaining y nullish coalescing cuando expresen correctamente la intención; no confundir valores falsy con ausencia.
- Evitar mutación compartida. Preferir transformaciones explícitas y estructuras inmutables cuando sea razonable.
- Una función no debe modificar variables globales ni mutar objetos o arreglos recibidos como entrada. Debe crear y devolver nuevos valores, salvo una excepción local, documentada y justificada por integración o rendimiento medido.
- No modificar prototipos globales.
- No depender de variables globales mutables.
- Evitar conversiones implícitas de tipos en reglas críticas.
- No usar números o strings mágicos; declarar constantes, tipos o valores de dominio.
- Preferir unions discriminadas para representar estados mutuamente excluyentes.
- No usar enums si un tipo literal o un objeto constante tipado expresa mejor el contrato.
- Exportar solamente lo necesario desde cada módulo.
- Evitar barrel files que generen ciclos o escondan dependencias importantes.

### 19.5 Asincronía y concurrencia

- Usar async/await de forma consistente.
- Toda promesa debe esperarse, devolverse o manejarse explícitamente.
- No utilizar promesas flotantes.
- No envolver innecesariamente una promesa dentro de new Promise.
- Ejecutar en paralelo solamente operaciones independientes y cuando sea seguro para el sistema externo o la base de datos.
- No utilizar forEach con callbacks async cuando se necesite esperar resultados.
- Definir timeouts y cancelación para llamadas externas cuando la librería lo permita.
- No mantener transacciones abiertas mientras se ejecutan llamadas de red, generación pesada de documentos o efectos externos.
- Las operaciones concurrentes del workflow deben protegerse con transacciones, restricciones e idempotencia; no confiar en verificaciones realizadas solamente en memoria.

### 19.6 Errores y observabilidad

- No capturar errores para ignorarlos.
- No usar excepciones para flujo esperado de negocio cuando un resultado tipado sea más claro.
- Diferenciar errores de validación, autorización, conflicto, inexistencia, integración e infraestructura.
- No exponer mensajes internos, SQL, credenciales ni stack traces al cliente.
- Conservar la causa original al transformar un error cuando sea seguro.
- Los logs deben ser estructurados y contener contexto útil, sin datos sensibles.
- No utilizar console.log como estrategia permanente de observabilidad productiva.
- Cada request y job debe poder correlacionarse mediante un identificador cuando la infraestructura se defina.
- Un error de job debe registrar intento, tipo de job, entidad relacionada y causa sanitizada.

### 19.7 Fechas, dinero e identificadores

- No calcular reglas de negocio con strings de fecha formateados para interfaz.
- Centralizar el reloj para permitir pruebas determinísticas.
- Guardar instantes en UTC y aplicar America/Santiago en presentación o reglas explícitamente locales.
- No asumir que un día siempre tiene 24 horas.
- No usar float para montos.
- No concatenar valores para construir identificadores de seguridad o consultas SQL.
- No exponer identificadores internos como prueba de autorización.

### 19.8 Base de datos y consultas

- Utilizar consultas parametrizadas; nunca concatenar entrada del usuario en SQL.
- Seleccionar solo las columnas necesarias.
- Evitar consultas N+1.
- Revisar índices para consultas relevantes, sin agregar índices especulativos.
- Paginar listados potencialmente grandes.
- Toda operación de escritura de varias etapas que deba ser atómica debe usar una transacción.
- Las restricciones importantes deben existir también en la base de datos, no solo en el código.
- No esconder consultas costosas dentro de getters, serializadores o ciclos.

### 19.9 API y contratos

- Mantener consistencia en nombres, paginación, filtros, errores y códigos HTTP.
- No devolver directamente modelos de persistencia si eso expone campos internos.
- Definir DTO o contratos de entrada y salida en los límites de la API.
- Los cambios incompatibles de contrato deben comunicarse antes de implementarse.
- No cambiar silenciosamente la semántica de un campo existente.
- Los endpoints de comandos deben expresar intención de negocio.

### 19.10 Comentarios y documentación

- El código debe explicar qué hace mediante su estructura y nombres.
- Usar nombres explicativos, precisos y fáciles de pronunciar para variables, funciones, clases y módulos.
- Los comentarios deben explicar por qué existe una decisión, una restricción o un comportamiento no evidente.
- No dejar comentarios que repitan literalmente el código.
- No mantener código comentado; eliminarlo y conservar el historial en Git.
- Todo TODO debe indicar una acción concreta y, cuando exista, su issue o decisión pendiente.
- Actualizar documentación cuando cambien comportamiento, configuración, contratos o procedimiento de ejecución.

### 19.11 Seguridad y calidad general

- Aplicar mínimo privilegio.
- Validar y normalizar entradas en los límites del sistema.
- Escapar la salida según el contexto de presentación.
- No construir criptografía, autenticación o sanitización propia cuando exista una solución aprobada y mantenida.
- No registrar secretos ni datos sensibles.
- Evitar dependencias innecesarias incluso cuando estén autorizadas.
- Priorizar claridad, corrección y mantenibilidad sobre soluciones ingeniosas.
- No optimizar sin evidencia, pero corregir consultas o algoritmos evidentemente ineficientes.
- Mantener compatibilidad con las versiones de Node.js y navegadores aprobadas para el proyecto.
- Todo código nuevo debe ser legible para otro integrante sin depender de conocimiento implícito del agente que lo creó.
- El código limpio debe ser verificable. Toda regla o comportamiento relevante debe contar con pruebas automatizadas proporcionales a su riesgo.

## 20. Definición de terminado

Un cambio está terminado cuando:

- Cumple lo solicitado y el alcance aprobado.
- Conserva seguridad, datos e invariantes.
- Incluye validaciones y permisos.
- Pasa pruebas relevantes.
- Pasa formato, lint, tipos y build cuando estén configurados.
- Actualiza documentación y contratos afectados.
- No sobrescribe cambios del usuario.
- Queda sin commit.
- Informa supuestos, riesgos, SQL pendiente y elementos no verificados.

Si faltan herramientas, credenciales, decisiones o ambientes, el agente informa la limitación en vez de simular que terminó.
