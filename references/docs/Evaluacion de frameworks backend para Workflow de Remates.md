# Evaluación de frameworks backend

## Sistema Workflow de Remates

**Objetivo:** seleccionar una tecnología backend adecuada para construir un MVP mantenible, escalable y capaz de evolucionar hacia el sistema completo.

**Frontend considerado:** Angular + TypeScript  
**Base de datos considerada:** MySQL 8 o MariaDB  
**Fecha:** 11 de noviembre de 2026

---

## 1. ¿Qué sistema se está construyendo?

El producto administrará el ciclo operativo de remates judiciales. Cuando una propiedad sea aceptada en `admin_new`, el sistema deberá iniciar automáticamente una instancia de workflow basada en una plantilla versionada.

El sistema debe soportar:

- Workflows con dependencias entre tareas.
- Tareas paralelas, manuales y automáticas.
- Asignación de gestores, postores y responsables legales.
- Vencimientos calculados desde fechas de negocio.
- Suspensión, reanudación, cancelación y reprogramación.
- Ramas posteriores al resultado del remate.
- Sincronización periódica con `admin_new`.
- Generación de documentos y envío de correos.
- Historial y auditoría completa.
- Permisos por rol o capacidad.
- Jobs, reintentos y recuperación ante fallos.

La complejidad principal no está en el volumen de tráfico, sino en las reglas de negocio, la concurrencia, los procesos automáticos y la trazabilidad.

---

## 2. Arquitectura recomendada

Para el MVP se recomienda un **monolito modular**, no microservicios.

```text
Angular
   │
   │ REST / OpenAPI
   ▼
Backend modular
   ├── Identidad y permisos
   ├── Propiedades
   ├── Workflow
   ├── Tareas
   ├── Automatizaciones
   ├── Documentos
   ├── Notificaciones
   ├── Integración admin_new
   ├── Reportes
   └── Auditoría
          │
          ▼
       MySQL 8
          │
     ┌────┴────┐
     ▼         ▼
  Worker    Scheduler
```

El servidor HTTP, el worker y el scheduler pueden compartir el mismo código y repositorio, pero deben ejecutarse como procesos separados.

---

## 3. Scheduler, jobs y workers

Estos conceptos cumplen responsabilidades diferentes:

| Componente | Responsabilidad | Ejemplo |
|---|---|---|
| Scheduler | Decide cuándo buscar o iniciar trabajo | Consultar `admin_new` cada minuto |
| Job | Representa una ejecución técnica pendiente | Generar una carta Vale Vista |
| Worker | Reserva y ejecuta jobs | Crear el PDF y guardar el resultado |
| Tarea de negocio | Representa el trabajo dentro del workflow | “Generar carta Vale Vista” |

Una tarea automática del workflow no debe confundirse con un job técnico. Una tarea puede originar varios jobs y cada job puede necesitar reintentos.

Para el MVP no es obligatorio utilizar Redis. Los jobs pueden persistirse inicialmente en MySQL:

```text
Scheduler → registra job en MySQL → worker lo reserva → ejecuta → registra resultado
```

Cuando aumente el volumen, el almacenamiento de la cola puede cambiar a Redis sin modificar las reglas del workflow.

---

## 4. Opciones evaluadas

### 4.1 Laravel

**Lenguaje y runtime:** PHP.

Laravel es un framework integral orientado a aplicaciones web y procesos de negocio. Incluye componentes maduros para base de datos, autenticación, autorización, jobs, scheduler, correo, notificaciones y almacenamiento.

#### Cómo funcionaría en este sistema

```text
Angular → API Laravel → MySQL
                         │
Laravel Scheduler ───────┤
Laravel Queue Worker ────┘
```

- El scheduler ejecutaría la sincronización con `admin_new` y la revisión de vencimientos.
- Laravel Queue procesaría generación de documentos, correos y automatizaciones.
- Eloquent o Query Builder manejaría persistencia y transacciones.
- Policies controlarían quién puede completar, suspender o reasignar.
- Actions encapsularían las operaciones del motor.

#### Ventajas

- Jobs, scheduler, reintentos y jobs fallidos integrados.
- Permite comenzar con una cola en MySQL y migrar a Redis.
- Ecosistema muy maduro para correo, documentos y almacenamiento.
- Autenticación y autorización bien resueltas.
- Alta productividad para un MVP.
- Documentación y comunidad amplias.
- Menor cantidad de decisiones de infraestructura.

#### Desventajas

- El frontend utiliza TypeScript y el backend PHP.
- No se comparten tipos directamente entre ambas capas.
- Eloquent puede ocultar consultas costosas si se utiliza sin cuidado.
- Existe riesgo de concentrar demasiada lógica en modelos, observers o controladores.

#### Evaluación

Es la alternativa de **menor riesgo general** para este sistema. Sus capacidades más maduras coinciden directamente con las necesidades del workflow.

---

### 4.2 AdonisJS

**Lenguaje:** TypeScript.  
**Runtime:** Node.js.

AdonisJS es un framework integral para Node.js. Su propuesta es similar a Laravel: convenciones, estructura, ORM, validación, autenticación y herramientas integradas.

#### Cómo funcionaría en este sistema

```text
Angular → API AdonisJS → MySQL
                           │
Scheduler externo ─────────┤
Worker AdonisJS ───────────┘
```

- Lucid manejaría modelos, migraciones y transacciones.
- Servicios o Actions implementarían el motor.
- Guards y policies controlarían permisos.
- Un scheduler externo ejecutaría comandos periódicos.
- Un paquete de colas o una cola propia en MySQL manejaría los jobs.

#### Ventajas

- TypeScript en frontend y backend.
- Menos configuración y decisiones que Express.
- Menos ceremonia que NestJS.
- Estructura adecuada para un monolito modular.
- Buena experiencia de desarrollo.
- Facilita que desarrolladores Angular participen en el backend.

#### Desventajas

- Comunidad y mercado laboral más pequeños.
- Ecosistema de jobs y monitoreo menos maduro que Laravel.
- Algunas integraciones requieren seleccionar paquetes externos.
- Mayor riesgo de depender de componentes con menor adopción.

#### Evaluación

Es la mejor opción si se busca **TypeScript de extremo a extremo** sin adoptar la complejidad de NestJS.

---

### 4.3 Express

**Lenguaje:** JavaScript o TypeScript.  
**Runtime:** Node.js.

Express es una librería HTTP minimalista, no un framework integral. Resuelve rutas y middleware, pero no define la arquitectura completa de una aplicación.

#### Cómo funcionaría en este sistema

```text
Angular → Express → MySQL
             │
             ├── Zod para validación
             ├── Drizzle/Kysely para datos
             ├── Sistema propio de autorización
             ├── Cola propia o BullMQ
             ├── Scheduler externo
             └── Integraciones seleccionadas por el equipo
```

#### Ventajas

- Curva inicial muy baja.
- Ecosistema enorme.
- Flexibilidad completa.
- Buen rendimiento.
- Fácil contratación de desarrolladores Node.js.
- El motor de referencia actual ya utiliza Express.

#### Desventajas

- Se deben escoger e integrar todas las piezas importantes.
- No entrega estructura para la lógica de negocio.
- Alto riesgo de lógica distribuida entre rutas, middleware y consultas.
- El equipo termina construyendo y manteniendo un framework interno.
- Jobs, seguridad, auditoría y manejo de errores requieren diseño propio.
- La facilidad inicial puede transformarse en deuda técnica.

#### Evaluación

Es viable si existe liderazgo backend fuerte y se define una plantilla arquitectónica antes de desarrollar. El motor actual sirve como prueba conceptual, pero Express puro no es la alternativa más segura para convertirlo en producto.

---

### 4.4 NestJS

**Lenguaje:** TypeScript.  
**Runtime:** Node.js.

NestJS entrega una arquitectura fuertemente estructurada sobre Node.js mediante módulos, controladores, providers, guards, pipes, interceptores e inyección de dependencias.

#### Cómo funcionaría en este sistema

```text
Angular → NestJS → MySQL
             │
             ├── Módulos por dominio
             ├── Guards de autorización
             ├── BullMQ + Redis
             ├── Scheduler
             └── Worker NestJS
```

#### Ventajas

- TypeScript de extremo a extremo.
- Excelente modularidad para equipos grandes.
- OpenAPI y validación bien integrados.
- Buen soporte para testing e inyección de dependencias.
- Integración madura con BullMQ, WebSockets y arquitecturas distribuidas.
- Reduce el riesgo de que cada módulo se organice de manera diferente.

#### Desventajas

- Curva y carga conceptual mayores.
- Más ceremonia para operaciones sencillas.
- Una regla puede quedar distribuida entre guards, pipes, providers y decorators.
- No incluye un ORM oficial único.
- La solución habitual de jobs agrega Redis desde temprano.

#### Evaluación

Es una alternativa sólida si el backend será desarrollado por varios equipos o si se desea una arquitectura muy prescrita. Para el MVP puede ser más complejo de lo necesario.

---

### 4.5 Django

**Lenguaje y runtime:** Python.

Django es un framework integral y maduro. Proporciona ORM, migraciones, autenticación, permisos, administración y herramientas para aplicaciones relacionales.

#### Cómo funcionaría en este sistema

```text
Angular → Django REST Framework → MySQL/PostgreSQL
                    │
                    ├── Django ORM
                    ├── Django Admin
                    ├── Celery
                    └── Redis o RabbitMQ
```

#### Ventajas

- ORM y migraciones maduros.
- Autenticación y permisos integrados.
- Django Admin puede acelerar la administración interna.
- Muy adecuado para dominios relacionales.
- Python es legible y productivo.
- Buen soporte transaccional y amplia comunidad.

#### Desventajas

- Para API normalmente se añade Django REST Framework.
- Los jobs suelen requerir Celery y Redis/RabbitMQ.
- Celery introduce complejidad operativa adicional.
- Menor continuidad tecnológica con Angular.
- El tipado no es tan integral como en TypeScript.

#### Evaluación

Es una opción técnicamente muy buena cuando existe experiencia Python. Sin esa ventaja, Laravel ofrece una solución más integrada para las necesidades automáticas del sistema.

---

## 5. Comparación resumida

| Criterio | Laravel | AdonisJS | Express | NestJS | Django |
|---|---:|---:|---:|---:|---:|
| Productividad inicial | Muy alta | Alta | Alta | Media | Alta |
| Estructura incorporada | Alta | Alta | Baja | Muy alta | Alta |
| Jobs y scheduler | Excelente | Bueno | Se construye | Bueno | Bueno con Celery |
| Configuración requerida | Baja | Baja-media | Alta | Media-alta | Media |
| Transacciones | Excelente | Muy buena | Depende de librerías | Muy buena | Excelente |
| TypeScript backend | No | Sí | Sí | Sí | No |
| Ecosistema | Muy grande | Mediano | Muy grande | Grande | Muy grande |
| Riesgo de desorden | Bajo | Bajo-medio | Alto | Bajo | Bajo |
| Curva de aprendizaje | Baja-media | Baja-media | Baja inicialmente | Media-alta | Media |
| Ajuste al sistema | Excelente | Muy bueno | Viable | Muy bueno | Muy bueno |

---

## 6. Caso de uso representativo

Cuando `admin_new` marca una propiedad como aceptada:

```text
1. El scheduler consulta admin_new.
2. El backend detecta una propiedad nueva.
3. Una transacción crea la copia local, la instancia y sus tareas.
4. El motor activa las tareas sin dependencias pendientes.
5. El administrador asigna gestor y postor.
6. Se abren tareas manuales y automáticas en paralelo.
7. El worker genera la carta Vale Vista.
8. Si falla, el job se reintenta con backoff.
9. El scheduler detecta vencimientos y genera alertas.
10. El postor registra el resultado.
11. El motor crea o activa la rama correspondiente.
12. Toda acción queda registrada en el historial.
```

El framework escogido debe facilitar este recorrido sin mezclar las tareas del negocio con los intentos técnicos de automatización.

---

## 7. Organización recomendada del backend

Independientemente del framework, se recomienda organizar el código por dominio:

```text
Modules/
  Identity/
  Users/
  Properties/
  WorkflowDefinitions/
  WorkflowExecution/
  Tasks/
  Automations/
  Documents/
  Notifications/
  AdminNewIntegration/
  Reporting/
  Audit/
```

Operaciones como estas deben implementarse como casos de uso explícitos:

```text
StartWorkflow
CompleteTask
AssignParticipants
SelectResultBranch
SuspendWorkflow
ResumeWorkflow
CancelWorkflow
RecalculateDeadlines
RetryAutomation
```

Los controladores deben limitarse a autenticación, validación, invocación del caso de uso y construcción de la respuesta HTTP.

---

## 8. Recomendación

### Recomendación principal

```text
Angular + Laravel + MySQL 8
```

Laravel presenta el menor riesgo para este producto porque sus capacidades más maduras coinciden con las necesidades principales:

- Jobs persistentes.
- Scheduler.
- Reintentos y backoff.
- Correo y notificaciones.
- Documentos y almacenamiento.
- Autorización.
- Transacciones.
- Auditoría e integraciones.

El uso de PHP en el backend no afecta la integración con Angular. La API se documenta mediante OpenAPI y el cliente TypeScript puede generarse automáticamente.

### Recomendación si se prioriza TypeScript

```text
Angular + AdonisJS + MySQL 8
```

AdonisJS es el mejor equilibrio cuando se quiere un solo lenguaje, una curva moderada y mayor estructura que Express.

### Cuándo escoger Express

Express debe elegirse solamente si:

- Existe liderazgo backend con experiencia.
- Se define previamente una arquitectura obligatoria.
- El equipo acepta mantener las integraciones y componentes seleccionados.
- Se crean pruebas de arquitectura y revisión técnica consistente.

### Cuándo escoger NestJS

NestJS resulta conveniente si se anticipan varios equipos backend, alta rotación de desarrolladores o una necesidad organizacional de estructura fuertemente prescrita.

### Cuándo escoger Django

Django debe priorizarse si el equipo posee experiencia Python o si Django Admin representa una ventaja importante para la operación.

---

## 9. Decisión sugerida

| Prioridad principal | Framework sugerido |
|---|---|
| Menor riesgo y mayor productividad | Laravel |
| TypeScript de extremo a extremo | AdonisJS |
| Flexibilidad con liderazgo técnico fuerte | Express |
| Estructura para múltiples equipos | NestJS |
| Experiencia previa en Python | Django |

La elección del framework no reemplaza el diseño del dominio. La sostenibilidad del producto dependerá principalmente de:

- Mantener separadas las definiciones e instancias de workflow.
- Versionar las plantillas.
- Ejecutar transiciones dentro de transacciones.
- Separar tareas de negocio y jobs técnicos.
- Garantizar idempotencia.
- Mantener historial inmutable.
- Probar concurrencia, reintentos, ramas y reprogramaciones.

Para el escenario actual, la decisión recomendada es **Laravel**. Si se establece como requisito mantener TypeScript en todo el sistema, la decisión recomendada pasa a ser **AdonisJS**.
