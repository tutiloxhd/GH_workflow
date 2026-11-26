# GrupoHouse — Enterprise Design System

**Versión:** 1.0 candidata  
**Estado:** Propuesta para revisión  
**Alcance:** Workflow y futuros módulos empresariales

## 1. Dirección visual

Adoptar el verde petróleo clásico como evolución de la identidad verde histórica de GrupoHouse. La estética Enterprise Minimal busca transmitir sobriedad, consistencia y madurez institucional, con superficies neutras, identidad corporativa desaturada y colores semánticos independientes.

El sistema debe contemplar desde el inicio los temas claro, oscuro y automático (según las preferencias del dispositivo).

## 2. Paleta corporativa

| Rol | Color |
|---|---|
| Profundo | `#123B3D` |
| Corporativo | `#205457` |
| Secundario | `#326D70` |
| Acento | `#78A5A5` |
| Suave | `#E8F1F1` |

El color de marca `#205457` se reserva para acciones principales, navegación activa, enlaces y selección; no debe dominar las superficies.

### Escala cromática

| Token | Hexadecimal | Uso |
|---|---|---|
| brand-50 | `#F3F8F8` | Fondos sutiles |
| brand-100 | `#E8F1F1` | Selección clara |
| brand-200 | `#CDE0E0` | Bordes activos |
| brand-300 | `#A5C5C5` | Primario en modo oscuro |
| brand-400 | `#78A5A5` | Acentos y foco oscuro |
| brand-500 | `#52898B` | Elementos gráficos |
| brand-600 | `#326D70` | Acciones secundarias y foco claro |
| brand-700 | `#205457` | Primario corporativo |
| brand-800 | `#19474A` | Hover claro |
| brand-900 | `#123B3D` | Énfasis profundo |
| brand-950 | `#0A2426` | Superficies profundas de marca |

## 3. Paleta por tema

Los neutros tendrán un matiz frío ligeramente azulado. El modo oscuro no será una inversión automática del claro.

| Token semántico | Claro | Oscuro |
|---|---|---|
| Fondo general | `#F5F7F8` | `#111719` |
| Superficie principal | `#FFFFFF` | `#192124` |
| Superficie secundaria | `#EEF2F3` | `#222D30` |
| Bordes | `#DCE3E5` | `#334246` |
| Texto principal | `#172326` | `#EAF0F1` |
| Texto secundario | `#536469` | `#A5B5B9` |
| Texto terciario | `#68797E` | `#899DA2` |
| Primario | `#205457` | `#A5C5C5` |
| Primario hover | `#19474A` | `#CDE0E0` |
| Texto sobre primario | `#FFFFFF` | `#123B3D` |
| Selección | `#E8F1F1` | `#203C3E` |
| Focus ring | `#326D70` | `#78A5A5` |

## 4. Paleta semántica

Los estados deben distinguirse por texto e iconografía, además del color. El verde de éxito es independiente del petróleo corporativo.

| Estado | Texto claro | Fondo claro | Texto oscuro | Fondo oscuro |
|---|---|---|---|---|
| Al día | `#166534` | `#DCFCE7` | `#86EFAC` | `#193626` |
| En alerta | `#92400E` | `#FEF3C7` | `#FCD34D` | `#3D3019` |
| Atrasado | `#B91C1C` | `#FEE2E2` | `#FCA5A5` | `#3D2020` |
| Suspendido | `#6D28D9` | `#F3E8FF` | `#C4B5FD` | `#302440` |
| Cancelado | `#475569` | `#F1F5F9` | `#CBD5E1` | `#30363D` |
| Completado | `#1D4ED8` | `#EFF6FF` | `#93C5FD` | `#1C304B` |

La asignación de colores no implica modificar el modelo de estados existente.

## 5. Aplicación en componentes

| Componente | Lineamiento |
|---|---|
| Sidebar | Superficie neutra en ambos temas; selección con fondo petróleo suave. Variante corporativa opcional con fondo `#123B3D`. |
| Header | Compacto, neutro, con buscador, selector temporal y perfil. |
| Indicadores | Tarjetas neutras, cifras destacadas e iconos semánticos; evitar colorear toda la tarjeta. |
| Tabla | Superficie neutra, divisores sutiles, jerarquía tipográfica y selección mediante token semántico. |
| Filtros | Estado, responsable, comuna y etapa; selección en petróleo. |
| Ficha lateral | Mantener el contexto del listado y utilizar superficies coherentes con el tema. |
| Acción principal | Fondo primario y texto sobre primario. |
| Acción secundaria | Fondo neutro y borde petróleo (`#205457` claro, `#78A5A5` oscuro). |
| Campos | Foco visible mediante el token de focus ring. |
| Progreso | Petróleo para tareas completadas, neutro para pendientes; acompañar con texto de progreso. |

## 6. Proporción de uso

| Grupo | Proporción orientativa |
|---|---:|
| Fondos y superficies | 60% |
| Textos, bordes y elementos secundarios | 30% |
| Identidad corporativa | 7% |
| Estados y feedback | 3% |

Estas proporciones no son reglas métricas estrictas. El objetivo es preservar el predominio de los neutros.

## 7. Fundamentos visuales

| Fundamento | Propuesta |
|---|---|
| Estética | Enterprise Minimal |
| Tipografía | Inter |
| Iconografía | Lucide |
| Navegación | Preferentemente neutra |
| Densidad | Compacta, orientada a productividad |
| Responsive | Escritorio y móvil |
| Sombras | Mínimas, reservadas para elevación |
| Degradados | Ninguno |
| Accesibilidad | WCAG 2.2 AA como objetivo |

## 8. Design tokens para Angular

Los componentes deben consumir tokens semánticos, evitando valores hexadecimales directos en sus estilos.

```css
:root {
  color-scheme: light;
  /* Identidad corporativa */
  --brand-50: #F3F8F8;
  --brand-100: #E8F1F1;
  --brand-200: #CDE0E0;
  --brand-300: #A5C5C5;
  --brand-400: #78A5A5;
  --brand-500: #52898B;
  --brand-600: #326D70;
  --brand-700: #205457;
  --brand-800: #19474A;
  --brand-900: #123B3D;
  --brand-950: #0A2426;

  /* Superficies */
  --color-background: #F5F7F8;
  --color-surface: #FFFFFF;
  --color-surface-secondary: #EEF2F3;
  --color-border: #DCE3E5;

  /* Tipografía */
  --color-text: #172326;
  --color-text-secondary: #536469;
  --color-text-muted: #68797E;

  /* Interacción */
  --color-primary: var(--brand-700);
  --color-primary-hover: var(--brand-800);
  --color-on-primary: #FFFFFF;
  --color-selected: var(--brand-100);
  --color-focus: var(--brand-600);

  /* Estados */
  --color-success: #166534;
  --color-success-bg: #DCFCE7;
  --color-warning: #92400E;
  --color-warning-bg: #FEF3C7;
  --color-danger: #B91C1C;
  --color-danger-bg: #FEE2E2;
  --color-info: #1D4ED8;
  --color-info-bg: #EFF6FF;
  --color-suspended: #6D28D9;
  --color-suspended-bg: #F3E8FF;
  --color-neutral: #475569;
  --color-neutral-bg: #F1F5F9;
}

[data-theme="dark"] {
  color-scheme: dark;
  /* Superficies */
  --color-background: #111719;
  --color-surface: #192124;
  --color-surface-secondary: #222D30;
  --color-border: #334246;

  /* Tipografía */
  --color-text: #EAF0F1;
  --color-text-secondary: #A5B5B9;
  --color-text-muted: #899DA2;

  /* Interacción */
  --color-primary: var(--brand-300);
  --color-primary-hover: var(--brand-200);
  --color-on-primary: var(--brand-900);
  --color-selected: #203C3E;
  --color-focus: var(--brand-400);

  /* Estados */
  --color-success: #86EFAC;
  --color-success-bg: #193626;
  --color-warning: #FCD34D;
  --color-warning-bg: #3D3019;
  --color-danger: #FCA5A5;
  --color-danger-bg: #3D2020;
  --color-info: #93C5FD;
  --color-info-bg: #1C304B;
  --color-suspended: #C4B5FD;
  --color-suspended-bg: #302440;
  --color-neutral: #CBD5E1;
  --color-neutral-bg: #30363D;
}
```

### Gestión del tema

- Ofrecer las preferencias claro, oscuro y sistema.
- Persistir la preferencia localmente.
- Resolver el tema automático mediante `prefers-color-scheme` y aplicar el atributo `data-theme` antes del primer renderizado para evitar destellos.
- Mantener una única implementación de cada componente para ambos temas.

## 9. Validación previa a la aprobación

- [ ] Verificar compatibilidad con el logotipo y manual de marca original.
- [ ] Auditar contrastes WCAG 2.2 AA en ambos temas: 4.5:1 para texto normal y 3:1 para controles y elementos gráficos cuando corresponda.
- [ ] Validar estados hover, focus, active, disabled y selección.
- [ ] Verificar legibilidad y consistencia en escritorio y móvil.
- [ ] Documentar los componentes y tokens en el sistema de diseño.

## 10. Consideraciones finales

La paleta constituye una propuesta candidata, no una identidad corporativa aprobada. Los valores hexadecimales son decisiones de diseño propuestas y no proceden de un manual de marca verificado. La auditoría exhaustiva de contraste queda pendiente. Los prototipos visuales anteriores son conceptuales; las tablas y tokens de este documento constituyen la referencia técnica. Las vistas interactivas no se incluyen en este archivo Markdown.
