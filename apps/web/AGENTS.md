# AGENTS.md — apps/web (frontend Angular)

Complementa el [AGENTS.md raíz](../../AGENTS.md); no reduce ninguna de sus restricciones.

## Stack aprobado

- Angular 22 (componentes standalone, router), TypeScript estricto, CSS plano.
- Pruebas unitarias con el runner de Angular (`ng test`, Vitest + jsdom).
- Requiere Node.js ≥ 22.22.3.

No se agregan librerías de UI, estado, gráficos ni utilidades sin aprobación explícita.

## Referencia visual

La maqueta de [references/demoweb/](../../references/demoweb/) sigue siendo referencia de interacción.
La paleta y los temas claro, oscuro y sistema implementados se basan en [references/design system/](../../references/design%20system/), según la solicitud del usuario. Los colores deben consumirse mediante tokens semánticos.
`references/` es de solo lectura: se lee, no se copia código tal cual ni se modifica.

## Reglas

- El frontend no decide estados protegidos ni reglas de negocio: llama a los endpoints de comando de la API.
- `localStorage` no es persistencia autoritativa.
- Los textos visibles van en español; el código (identificadores, archivos) en inglés.
- Los tipos de la API se generan o validan desde `apps/api/openapi.yaml` cuando sea práctico.
- Accesibilidad: navegación por teclado, foco visible y controles táctiles de al menos 44 px.
- Todo cambio visual se revisa en teléfono, tablet y escritorio.

## Comandos de verificación

Ejecutar desde `apps/web`:

```bash
npm run build        # compilación de producción
npm test -- --watch=false   # pruebas unitarias
npm start            # servidor de desarrollo en http://localhost:4200
```

## Desarrollo local

- `npm start` levanta Angular en `127.0.0.1:4200` y reenvía `/api` a la API en `localhost:3000` (`proxy.conf.json`).
- Abrir la aplicación en `http://localhost:4200`: la API solo acepta escrituras con `Origin` igual a su `WEB_ORIGIN`.
- La API debe estar corriendo (`npm run dev` en `apps/api`).

## Estructura

```text
src/app/
  core/      servicios y modelos transversales (auth, api, users, workflow, sync, time)
  layout/    shell con barra lateral y menú lateral en pantallas estrechas
  pages/     una carpeta por pantalla (home, my-tasks, workflow, users, sync, login)
  shared/    piezas reutilizables (icon, modal)
```

- Fechas: todo se muestra en hora de Santiago con `core/time/santiago-time.ts`; un `datetime-local` se convierte con `santiagoLocalToIso` antes de enviarlo.
- Los textos de estados, roles y eventos viven en los modelos (`*_LABELS`), no en las plantillas.
- Los formularios de evidencia se dibujan desde `evidenceForm` que entrega la API; no se definen en el frontend.
- Los diálogos usan `<dialog>` nativo mediante `shared/modal/modal-dialog.ts`. En pruebas con jsdom hay que simular `showModal`.
