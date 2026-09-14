# AGENTS.md — Copixi | Contrato Técnico y de Producto

> **LEER ESTE ARCHIVO ANTES DE MODIFICAR EL PROYECTO.**
> Este archivo es el contrato técnico y de producto para el desarrollo de **Copixi**. Cualquier agente que trabaje en este repositorio debe respetarlo estrictamente. No reemplazar tecnologías, no introducir dependencias prohibidas y no violar restricciones sin autorización documentada.

---

## 1. Producto — Qué es Copixi

**Copixi** es un **AI Data Analyst**.

Objetivo: convertir datos empresariales en información útil y decisiones mediante una interfaz de análisis interactiva con IA.

El usuario debe poder:

1. Cargar un CSV
2. Analizar automáticamente el dataset
3. Ver métricas
4. Explorar gráficos
5. Filtrar información
6. Detectar tendencias
7. Detectar anomalías simples
8. Preguntar sobre los datos mediante lenguaje natural
9. Permitir que la IA modifique el dashboard mediante acciones estructuradas
10. Obtener insights y recomendaciones

**Principio de experiencia:**

> Copixi NO debe sentirse como un chatbot con un dashboard pegado al lado.
> Debe sentirse como **una aplicación de análisis de datos diseñada alrededor de IA.**

---

## 2. Principio de Producto — Flujo Central

```
DATA → ANALYSIS → AI → ACTION → DECISION
```

La IA debe poder **interactuar con la aplicación**, no solo responder texto.

Ejemplo válido:

Usuario: `Show me sales from Bogotá.`

IA debe emitir acción estructurada:
```json
{
  "action": "setFilter",
  "column": "city",
  "operator": "equals",
  "value": "Bogotá"
}
```
→ El dashboard se actualiza.

**Regla:** La IA nunca se limita a texto plano. Debe producir acciones validadas por la app.

---

## 3. Stack Obligatorio

Usar exclusivamente este stack. No sustituir sin autorización documentada (ver §41).

| Categoría | Tecnología |
|-----------|------------|
| Framework | React |
| Lenguaje | TypeScript |
| Build | Vite |
| Package Manager | pnpm |
| Estilos | Native CSS + CSS Modules (cuando sea apropiado) |
| UI Primitives | Radix UI |
| Iconos | Pixelarticons |
| Charts | — (Recharts eliminado en Fase 17: app PDF-only, sin dashboard tabular) |
| PDF Parsing | pdfjs-dist (Fase 17: fuera CSV/Excel — Papa Parse y xlsx desinstalados) |
| AI UI | Vercel AI SDK (`useChat`/`streamText`) + Gemini (Fase 13: reemplaza CopilotKit) |
| Backend-as-a-Service (solo si aporta valor) | InsForge |
| AI Model | Gemini API |
| Deploy | Vercel |

No añadir frameworks CSS, UI kits, librerías de iconos o backends no listados.

---

## 4. Package Manager — pnpm Obligatorio

**Exclusivamente `pnpm`. Nunca `npm`, `yarn`, `bun`.**

Comandos canónicos:
```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

- No generar instrucciones, scripts o documentación con `npm`.
- No commitear `package-lock.json` ni `yarn.lock`. Solo `pnpm-lock.yaml`.
- Verificar en CI/Quality Gate que no existan scripts con `npm`.

---

## 5. Prohibiciones Absolutas

### 5.1 CSS — Prohibido
```
Tailwind CSS, UnoCSS, Windi CSS
```
Usar **CSS nativo** + CSS Modules cuando sea apropiado. Definir design tokens con variables CSS.

### 5.2 UI — Prohibido
```
shadcn/ui
```
Usar **Radix UI** y construir estilos propios con CSS nativo.

### 5.3 Iconos — Prohibido
```
lucide-react, Heroicons, Font Awesome, Material Icons
```
Usar **exclusivamente Pixelarticons**.

### 5.4 Backend Tradicional — Prohibido crear
```
FastAPI, Express, Node backend, NestJS, Docker, Redis, VPS, PostgreSQL propio
```
Copixi es **frontend-first** (ver §6). Solo se permite una Vercel Function mínima para proxy de Gemini (ver §11) e InsForge cuando esté justificado (ver §31).

---

## 6. Frontend-First — Arquitectura Conceptual

Maximizar procesamiento en el navegador. No crear infraestructura backend innecesaria.

```
User
 ↓
React
 ↓
Browser Data Engine (Papa Parse + transformations + statistics)
 ↓
Analytics
 ↓
Dashboard
 ↓
AI Copilot (CopilotKit + Gemini)
 ↓
AI Actions (validadas)
 ↓
Dashboard State
```

Toda operación determinista (parsing, filtrado, agregación, estadística) ocurre en cliente.

---

## 7. Data Processing

**Librería obligatoria para CSV:** `Papa Parse`.

El navegador debe encargarse de:

- parsing
- column detection
- type inference (number, date, string, boolean)
- filtering / sorting
- aggregations (sum, avg, count, min, max)
- statistics (median, std, percentiles)
- rankings
- trend calculations
- anomaly detection simple (ej: z-score, IQR)
- chart data preparation

**Regla crítica:** No usar un LLM para operaciones matemáticas deterministas. El LLM solo recibe contexto agregado (ver §8).

Estructura esperada (no crear código ahora, solo respetar contrato):
```
src/data/
  parser.ts
  profiler.ts
  statistics.ts
  transformations.ts
  anomalyDetection.ts
```

Funciones de análisis deben ser puras e independientes de JSX.

---

## 8. Privacidad

> **Your data stays in your browser whenever possible.**

- No subir automáticamente el dataset completo a un servidor.
- No enviar automáticamente todas las filas a un LLM.
- El LLM recibe solo contexto mínimo necesario.

**Ejemplo correcto — enviar:**
```json
{
  "rowCount": 10234,
  "columns": [
    { "name": "city", "type": "string", "distinctCount": 12 },
    { "name": "sales", "type": "number", "min": 0, "max": 50000 }
  ],
  "metrics": { "totalSales": 1234567, "avgSales": 120.5 },
  "topProducts": [{ "product": "Widget A", "sales": 45000 }],
  "salesByCity": [{ "city": "Bogotá", "sales": 120000 }],
  "trends": [{ "period": "2024-01", "sales": 98000 }],
  "currentFilters": { "city": "Bogotá" }
}
```

**Ejemplo incorrecto — no enviar:**
```
10,000 rows completas al LLM
```

---

## 9. AI Model — Gemini

- Proveedor principal: **Gemini API**.
- Diseñar para funcionar dentro del **free tier**. No asumir presupuesto para APIs pagas.
- No requerir modelos pagos.
- Minimizar consumo de tokens: enviar contexto agregado, no filas crudas; limitar historial de chat enviado.

---

## 10. API Key — Seguridad

Nunca exponer `GEMINI_API_KEY` en frontend.

**Prohibido:**
- Escribir API keys directamente en `.ts`, `.tsx`, `.js`, `.jsx`.
- Usar `VITE_GEMINI_API_KEY` o cualquier `VITE_*` para secretos.
- Commitear `.env` con secretos.
- Exponer clave en logs, errores o respuestas del cliente.

La clave debe permanecer en **variables de entorno del servidor** (Vercel Environment Variables).

---

## 11. Vercel — Deploy y Proxy

Deploy obligatorio en **Vercel**.

Para proteger la API key se permite **una Vercel Function mínima** como proxy:

```
React → Vercel Function (/api/chat) → Gemini API (con fallback OpenRouter)
```

Restricciones de la function:

- No convertirse en backend tradicional.
- No crear API compleja ni múltiples endpoints innecesarios.
- Solo lo necesario para: (1) proteger la key, (2) validar payload, (3) llamar a Gemini, (4) retornar respuesta.
- Validar y sanitizar input. Rate-limit básico si es trivial.
- Ubicación sugerida: `api/gemini.ts` o `api/copilot.ts`.

---

## 12. CopilotKit — Uso Obligatorio y Correcto

Usar **CopilotKit** como parte central de la experiencia AI-native UI.

**Prohibido:** usar CopilotKit solo como chatbot flotante sin integración con estado.

Debe usarse para que la IA:

- conozca contexto relevante del dashboard (dataset profile, métricas, filtros activos)
- interprete preguntas en lenguaje natural
- invoque acciones estructuradas
- cambie filtros / visualizaciones
- genere insights y recomendaciones
- interactúe con el estado de React (`useCopilotReadable`, `useCopilotAction`)

---

## 13. AI Actions — Acciones Estructuradas

Las acciones deben ser **explícitas, tipadas y validadas**.

Lista base (extensible con justificación):
```
setFilter
clearFilters
setChart
setDateRange
compareValues
showInsight
```

Ejemplo de contrato:
```typescript
type AIAction =
  | { action: "setFilter"; column: string; operator: "equals" | "contains" | "gt" | "lt" | "between"; value: unknown }
  | { action: "clearFilters" }
  | { action: "setChart"; chartType: "line" | "bar" | "area" | "pie"; x: string; y: string }
  | { action: "setDateRange"; from: string; to: string }
  | { action: "compareValues"; column: string; values: string[] }
  | { action: "showInsight"; insight: string };
```

Reglas:

- Nunca permitir que el modelo genere y ejecute código JavaScript arbitrario (`eval`, `new Function`).
- El modelo produce JSON estructurado → la app valida (esquema + whitelist de columnas/valores) → ejecuta.
- Loggear acciones rechazadas en desarrollo.

---

## 14. Dashboard State

Estado relevante en **React** (Context / Zustand pequeño / Jotai si se justifica). **No introducir Redux por costumbre.**

Estado conceptual mínimo:
```typescript
type DashboardState = {
  dataset: Row[] | null;
  columns: ColumnMeta[];
  filters: Filter[];
  activeChart: ChartConfig | null;
  metrics: Metrics;
  insights: Insight[];
  chatMessages: ChatMessage[];
};
```

Reglas:

- Una sola fuente de verdad para filtros y dataset.
- AI Actions mutan el estado a través de reducers/handlers validados, no directamente.
- Persistencia local opcional (localStorage) solo para preferencias, no para reemplazar InsForge.

---

## 15. Data Engine — Separación de Responsabilidades

Separar lógica de datos de la interfaz.

```
src/data/
  parser.ts              // Papa Parse wrapper + validación
  profiler.ts            // column detection, type inference, nulls, distinct
  statistics.ts          // sum, avg, median, std, percentiles
  transformations.ts     // filter, sort, groupBy, aggregate
  anomalyDetection.ts    // z-score / IQR simple
  chartAdapter.ts        // prepara datos para Recharts
```

- Funciones puras, testeables, sin dependencias de React.
- No colocar lógica compleja de análisis dentro de JSX.

---

## 16. Component Architecture

Crear componentes reutilizables, pequeños y con responsabilidad única.

```
src/components/
  ui/           // Button, Card, Badge, Skeleton (sobre Radix)
  data/         // FileUploader, DataTable, DataProfiler
  dashboard/    // KPIGrid, ChartCard, FilterBar, InsightCard
  copilot/      // CopilotPanel, ChatMessage, AIActionIndicator
```

Lista de referencia (no exhaustiva):
```
FileUploader, DataTable, DataProfiler, KPIGrid, ChartCard,
FilterBar, InsightCard, CopilotPanel, ChatMessage, AIAction
```

- No crear componentes gigantes (>300 líneas).
- Props tipadas. Evitar prop drilling excesivo; usar context donde tenga sentido.

---

## 17. UI Library — Radix UI

Usar **Radix UI** para componentes con accesibilidad compleja:

```
Dialog, DropdownMenu, Tooltip, Tabs, Popover,
Select, ScrollArea, Separator, Accordion, Checkbox
```

- Radix proporciona comportamiento y a11y.
- El diseño visual se hace con CSS propio. No importar estilos de otras librerías.

---

## 18. Icon System — Pixelarticons

Usar **exclusivamente Pixelarticons**.

Reglas:

- Tamaños consistentes (ej: 16, 20, 24px).
- `aria-label` o `aria-hidden` según corresponda.
- No reemplazar texto con solo icono si el significado no es obvio.
- No introducir otra librería de iconos bajo ninguna circunstancia.

---

## 19. CSS — Estilo Nativo

Usar **CSS nativo** (y CSS Modules cuando sea apropiado). Sin frameworks.

Definir variables globales en `:root`:
```css
:root {
  --color-bg, --color-surface, --color-text, --color-muted, --color-primary, --color-border
  --space-xs, --space-sm, --space-md, --space-lg, --space-xl
  --radius-sm, --radius-md, --radius-lg
  --font-sans, --font-mono, --text-sm, --text-base, --text-lg
  --shadow-sm, --shadow-md
  --transition-fast, --transition-normal
}
```

Evitar:

- exceso de sombras y gradientes
- glassmorphism exagerado
- animaciones innecesarias
- tarjetas redundantes

Priorizar: claridad, jerarquía, espacio negativo, legibilidad.

---

## 20. Visual Design

Copixi debe parecer un **producto SaaS moderno y profesional**.

Inspiración (sin copiar marcas):
```
Linear, Notion, modern AI products, modern analytics dashboards
```

Principios:

- claridad y jerarquía tipográfica
- espacio negativo generoso
- tipografía limpia (system font o Inter/Geist si se justifica)
- navegación sencilla y consistente
- paleta sobria, acentos puntuales

---

## 21. Landing Page

Debe existir una landing sencilla y pulida.

Contenido obligatorio:

- Headline: `Your AI Data Analyst`
- Supporting: `Turn raw business data into clear decisions.`
- CTA primario: `Analyze your data` → lleva a upload/dashboard
- Opción secundaria: `Try demo data` → carga dataset demo sin requerir CSV

La landing es P0. No bloquear al usuario exigiendo CSV.

---

## 22. Demo Data

Incluir dataset de demostración con datos empresariales realistas.

Columnas requeridas:
```
date, product, category, city, sales, units, customers
```

Debe permitir demostrar:

- tendencias temporales
- diferencias entre ciudades
- rankings de productos/categorías
- filtros y comparaciones
- anomalías simples (picos/caídas)

Ubicación sugerida: `public/demo.csv` o `src/data/demo.ts` (generado). No fetchear de CDN externo sin fallback local.

---

## 23. User Flow — Flujo Principal

```
Landing
 ↓
Try demo / Upload CSV
 ↓
Data profiling (columns, types, rowCount)
 ↓
Dashboard (KPIs + Charts)
 ↓
Explore (filtros, cambios de gráfico)
 ↓
Ask Copixi (lenguaje natural)
 ↓
AI action (setFilter, setChart, etc.)
 ↓
Dashboard changes (estado actualizado)
 ↓
Insight / Recommendation
```

El usuario debe llegar al valor principal en <30 segundos con demo data.

---

## 24. Upload Experience

Debe soportar:

- drag & drop
- file picker
- estados: idle, loading, success, error
- validación (tipo `text/csv`, extensión `.csv`, tamaño)
- manejo de errores con mensaje accionable
- información post-procesamiento:

```
filename, size (KB/MB), rows, columns
```

No mostrar pantalla vacía tras error. Siempre ofrecer retry / try demo.

---

## 25. Dashboard

Secciones obligatorias:

```
Overview | Data | Insights | AI Analyst
```

Debe mostrar:

- KPI cards (ej: total sales, avg sales, total units, customers)
- charts (ver §26)
- filters (FilterBar)
- trends
- insights (InsightCard)
- dataset information (columnas, tipos, nulos)

No sobrecargar. Priorizar 4-6 KPIs y 2-4 gráficos principales.

---

## 26. Charts — Recharts

Librería obligatoria: **Recharts**.

Priorizar:

```
LineChart (tendencias temporales)
BarChart (rankings, comparaciones)
AreaChart (volumen acumulado)
PieChart (distribución por categoría/ciudad — usar con moderación)
```

Reglas:

- Cada gráfico debe tener propósito analítico claro.
- Proveer `ResponsiveContainer`, tooltips accesibles, empty state.
- No crear gráficos innecesarios para "llenar" el dashboard.

---

## 27. Error Handling

Manejar correctamente y con UI dedicada:

- CSV inválido / corrupto
- CSV vacío
- archivo demasiado grande (definir límite, ej: 10-20 MB cliente)
- columnas incompatibles / tipos inconsistentes
- datos faltantes (nulls)
- errores de IA (timeout, rate limit, respuesta inválida)
- errores de red
- errores de parsing (Papa Parse errors)

Nunca mostrar pantalla completamente vacía tras error. Mostrar mensaje + acción (retry, upload another, try demo).

---

## 28. Loading States

Crear estados visuales para:

- parsing
- analysis / profiling
- AI response (streaming si aplica)
- AI action (ej: "Applying filter…")
- chart generation

Usar **skeletons o indicadores discretos**. No animaciones excesivas ni spinners de pantalla completa prolongados.

---

## 29. Responsive

Debe funcionar en:

```
desktop (primario, optimizado)
tablet
mobile (funcional, navegación colapsable)
```

Copixi es herramienta de análisis → desktop es prioridad. En mobile: KPIs en columna única, charts con scroll horizontal o stack vertical, filtros en drawer.

---

## 30. Accessibility

Obligatorio:

- semantic HTML (`<main>`, `<nav>`, `<table>`, `<button>`)
- keyboard navigation completa
- visible focus states
- ARIA labels (`aria-label`, `aria-describedby`)
- accessible dialogs/forms/buttons (apoyarse en Radix UI)
- contraste AA mínimo
- no depender solo de color para transmitir información

---

## 31. InsForge — Uso Condicional

Usar **InsForge** solo cuando aporte valor y **después** de que el flujo P0 funcione (ver §32).

Casos de uso válidos:

```
authentication
saved datasets
saved analyses
user preferences
history
```

Flujo obligatorio:

```
Anonymous → Upload → Analyze → Use AI → Optional account → Save
```

**Prohibido:**

- Requerir registro para probar Copixi.
- Implementar autenticación antes de tener funcionando el flujo principal (landing → upload → dashboard → AI actions).

---

## 32. MVP Priority

### P0 — Obligatorio (implementar primero)
```
Landing
Demo dataset
CSV upload (drag & drop + picker)
CSV parsing (Papa Parse)
Data profiling
KPI dashboard
Charts (Recharts)
Filters
AI Analyst (CopilotKit + Gemini via Vercel Function)
AI actions (validadas)
Responsive UI
Error handling
```

### P1 — Después
```
InsForge authentication
Saved analyses
Saved datasets
History
```

### P2 — Solo si queda tiempo
```
Advanced anomaly detection
Report generation
Export (CSV/PNG)
Multiple datasets
Advanced comparisons
```

**Nunca empezar por P1 o P2.** No implementar P1 sin P0 completo y verificado (ver §38).

---

## 33. Performance

Priorizar:

- lazy loading (`React.lazy` para dashboard/copilot cuando sea apropiado)
- procesamiento eficiente de datasets (evitar O(n²) innecesario, usar `useMemo` con criterio)
- evitar renders innecesarios (memoización solo cuando aporte valor medible)
- componentes pequeños
- minimizar dependencias y bundle size

No optimizar prematuramente. Medir antes de memoizar.

---

## 34. Dependency Discipline

Antes de añadir una dependencia, comprobar en orden:

1. ¿React ya lo resuelve?
2. ¿Radix UI lo resuelve?
3. ¿Una API nativa del navegador lo resuelve?
4. ¿Una dependencia existente lo resuelve?

No instalar librerías para funciones pequeñas que pueden resolverse con ~20 líneas de código propio. Mantener el proyecto pequeño. Documentar justificación en PR/commit si se añade dependencia.

---

## 35. No Sobreingeniería

No crear:

```
microservicios, arquitectura enterprise, múltiples servidores,
bases de datos innecesarias, colas, caches complejas,
Docker, CI/CD complejo
```

Copixi es un **portfolio-grade MVP**. La simplicidad es una característica. Elegir la solución más simple que cumpla el requisito.

---

## 36. Git

Usar Git con commits pequeños y descriptivos (Conventional Commits recomendado):

```
feat: add csv upload
feat: add dataset profiler
feat: add dashboard metrics
feat: add AI analyst
feat: add dashboard actions
fix: handle invalid csv
chore: configure vite + ts
```

- No hacer commits gigantes con toda la aplicación.
- No commitear secretos, `node_modules`, `.env`, `dist`.

---

## 37. README — A crear posteriormente

Cuando se solicite, crear README profesional que explique:

```
What is Copixi?
Problem
Solution
Features
Architecture (frontend-first, Browser Data Engine)
AI architecture (CopilotKit + Gemini + Vercel Function + validated actions)
Privacy approach (data stays in browser)
Tech stack
Local development (pnpm install / pnpm dev)
Deployment (Vercel)
```

Presentar como:

> **AI-native data analytics product**

No como tutorial de React.

---

## 38. Quality Gate — Checklist de Tarea Terminada

Antes de considerar cualquier tarea terminada, verificar:

```
[ ] pnpm install funciona
[ ] pnpm dev funciona
[ ] pnpm build funciona (sin errores de TypeScript)
[ ] No hay Tailwind / UnoCSS / Windi CSS
[ ] No hay shadcn/ui
[ ] No hay lucide-react / Heroicons / Font Awesome / Material Icons
[ ] Solo Pixelarticons para iconos
[ ] No hay scripts con npm/yarn/bun
[ ] No hay API keys expuestas (ni VITE_GEMINI_API_KEY)
[ ] No hay backend tradicional innecesario
[ ] CSV processing funciona (Papa Parse, local)
[ ] Demo data funciona (Try demo data)
[ ] Dashboard muestra KPIs, charts, filtros
[ ] AI actions son validadas antes de ejecutarse
[ ] Responsive funciona (desktop prioritario, mobile funcional)
[ ] Error handling no deja pantalla vacía
[ ] Vercel Function solo hace proxy mínimo a Gemini
```

---

## 39. Agent Behavior — Reglas para Agentes Futuros

Todo agente que trabaje en Copixi debe:

1. Leer `AGENTS.md` completo antes de modificar el proyecto.
2. Respetar todas las restricciones de stack y prohibiciones (§3, §5).
3. No reemplazar tecnologías sin autorización documentada (§41).
4. No introducir nuevas dependencias sin justificación (§34).
5. No crear backend tradicional (§5.4, §6, §11).
6. No cambiar el package manager (§4).
7. No cambiar la librería de iconos (§18).
8. No cambiar la estrategia de CSS (§19).
9. No exponer secrets (§10).
10. Priorizar funcionalidad P0 sobre complejidad (§32).
11. Verificar Quality Gate antes de marcar tarea como done (§38).
12. Mantener `AGENTS.md` actualizado si una decisión cambia con autorización.

---

## 40. Regla de Decisión — Orden de Prioridad

Cuando exista duda técnica, elegir en este orden:

```
1. Simplicidad
2. Seguridad
3. UX
4. Performance
5. Mantenibilidad
6. Escalabilidad
```

No sacrificar simplicidad por arquitectura innecesariamente sofisticada. No sacrificar seguridad por conveniencia.

---

## 41. Regla de Cambios — Cambios Arquitectónicos

Si una implementación requiere cambiar una decisión arquitectónica importante (stack, prohibiciones, flujo de privacidad, proxy, state management):

**No hacerlo silenciosamente.**

Primero documentar en un comentario, issue o sección en PR:

```
Current approach:
Problem:
Proposed change:
Why:
Trade-offs:
Impact on: [stack | privacidad | seguridad | UX | performance]
```

Solo después de autorización, realizar el cambio y actualizar `AGENTS.md`.

---

## 42. Roadmap por Fases — Plan de Implementación

> Este roadmap divide el trabajo en fases secuenciales y auditables. Cada fase tiene criterio de salida (Definition of Done) ligado al Quality Gate (§38). No avanzar a la siguiente fase sin completar la anterior.

### Fase 0 — Contrato (Completada 2026-08-21)
**Objetivo:** Establecer contrato técnico y de producto sin código.
- Entregable: `AGENTS.md` inicial
- Criterio: contrato revisado, stack y prohibiciones congeladas (§3, §5, §41)

### Fase 1 — Fundación (P0 base) — **COMPLETADA 2026-08-21**
**Objetivo:** Base ejecutable que entregue valor en <30s con demo data, sin IA todavía.

Incluye:
- Scaffolding: Vite + React + TypeScript + pnpm (verificado `pnpm build`)
- Design tokens CSS nativo (`src/index.css` §19) + layout base (`src/App.css` §20)
- Browser Data Engine puro (§7, §15):
  - `src/data/parser.ts` (Papa Parse wrapper + `validateFile`)
  - `src/data/profiler.ts` (type inference, distinct, nulls, min/max)
  - `src/data/statistics.ts` (sum, avg, median, std, percentiles, `computeMetrics`)
  - `src/data/transformations.ts` (filter, sort, groupBy)
  - `src/data/anomalyDetection.ts` (z-score / IQR)
  - `src/data/chartAdapter.ts` (Recharts adapters)
  - `src/data/types.ts` (tipos compartidos)
- Demo data: `public/demo.csv` con columnas `date,product,category,city,sales,units,customers` (§22)
- Landing Page (§21): headline `Your AI Data Analyst`, supporting, CTA `Analyze your data` + `Try demo data`, Radix Dialog explicativo
- Upload Experience (§24): drag & drop + file picker, estados idle/loading/success/error, validación tipo/tamaño (15 MB), mensaje accionable, file meta (name, size, rows, cols), nunca pantalla vacía
- Dashboard mínimo (§25, §26): KPIs (totalSales, avgSales, totalUnits, totalCustomers), LineChart (tendencia mensual) + BarChart (sales by city), profiler table, anomaly list, empty states
- Infra mínima: `api/gemini.ts` placeholder proxy + `vercel.json` + provider base

**Definition of Done Fase 1:**
```
[x] pnpm install / dev / build OK sin errores TS (verificado 2026-08-21, tsc+vite ok)
[x] Landing renderiza headline + 2 CTAs + demo funciona en <30s
[x] Upload drag&drop + picker + validación + error recovery (try demo)
[x] Papa Parse local, sin enviar filas al servidor/LLM (§8) — src/data/parser.ts
[x] KPIs + 2 charts Recharts con ResponsiveContainer + tooltips + empty state
[x] Dataset profile visible (columns, types, nulls, distinct)
[x] Design tokens + CSS nativo + Pixelarticons + Radix Dialog (a11y)
[x] Responsive base (KPIs/charts colapsan en mobile) + skeletons
[x] Sin Tailwind/shadcn/lucide, sin VITE_ secrets, sin backend tradicional
```

### Fase 2 — Dashboard Completo (P0) — **COMPLETADA 2026-08-21**
**Objetivo:** Dashboard interactivo sin IA (pre-requisito para AI actions).
- DashboardState centralizado (Context ligero §14, sin Redux): `src/state/DashboardContext.tsx` — single source of truth para `rawRows/filters/metrics`, derivado `filteredRows/profile/timeSeries/byCity/byCategory/byProduct/anomalies` vía `useMemo`, handlers validados `addFilter` con whitelist columnas + `FilterOperator` (§13), `clearFilters/removeFilter`, log de rechazos en dev
- FilterBar validado (§13 tipos): `src/components/dashboard/FilterBar.tsx` — Radix Select para columna/operator, datalist con distinct values (≤50), input + between `value2`, chips con remove + `clear all`, validación `isValidFilter` (columna existente, operator válido, value numérico para gt/lt/between)
- DataTable + ChartCard + InsightCard base: `src/components/data/DataTable.tsx` (búsqueda global, sort por columna con `aria-sort`, paginación 10/page, empty states), `src/components/dashboard/ChartCard.tsx` wrapper con `empty` dedicado, `src/components/dashboard/InsightCard.tsx` (6 insights determinísticos: top city/category/product, highest sale, anomaly)
- Tabs/Secciones: Radix Tabs `Overview | Data | Insights | AI Analyst` — `src/App.tsx:141` — Overview (KPIs+4 charts con propósito + anomalies), Data (FilterBar+DataTable+Profiler), Insights (InsightCard+trend+rankings), AI Analyst (placeholder Fase 3 con explicación CopilotKit/Gemini §12)
- Trends, rankings, comparaciones, anomaly UI pulida: `toTimeSeries` mensual (AreaChart), `toBarData` city/category, `LineChart` product, rankings top 3, anomaly z-score >2.5 expandida a 5
- Loading states completos (§28) + error handling §27: `loading` skeletons, `error` alert con retry/demo, empty states en charts/tabla/insights
- Responsive final (§29) + a11y §30: grid colapsa (KPIs 4→2→1, charts 1.4fr→1fr, insights 2→1), Radix Tabs keyboard nav, `aria-label/aria-sort/role`, `focus-visible` outline, contraste AA, semantic `header/main/nav/table`

**DoD Fase 2:**
```
[x] Filtros mutan estado vía handlers validados (whitelist columnas + schema, log rechazos)
[x] Tabla paginada/filtrable/buscable/sortable con empty states
[x] Charts cambian con filtros (timeSeries/byCity/byCategory/byProduct recalculados sobre filteredRows)
[x] Todos los estados carga/error con UI dedicada (skeletons, alerts, empty)
[x] 4 gráficos con propósito analítico (Area temporal, Bar ciudad, Bar categoría, Line producto) + ResponsiveContainer
[x] Tabs Overview|Data|Insights|AI Analyst funcionales (Radix Tabs, keyboard, focus)
[x] pnpm build ok, sin Tailwind/shadcn/lucide, sin VITE_ secrets, sin backend tradicional
```

### Fase 3 — AI-Native (P0) — **COMPLETADA 2026-08-21**
**Objetivo:** IA que *acciona* el dashboard, no solo chatea (§2, §12, §13).
- CopilotKit integrado correctamente (`useCopilotReadable` para context agregado, `useCopilotAction` para acciones): `src/main.tsx:6` envuelve con `<CopilotKit runtimeUrl="/api/copilotkit">`, `src/components/copilot/CopilotPanel.tsx:15` expone `dashboardContext` agregado vía `useCopilotReadable` (rowCount, columns, metrics, topProducts, salesByCity, trends, currentFilters, activeChart), 6 acciones validadas con handler+schema
- Vercel Functions mínimas (§10, §11): `api/copilotkit.ts:1` (`reflect-metadata` + `CopilotRuntime` + `GoogleGenerativeAIAdapter` `gemini-2.0-flash`, rate-limit 20/min, ip extraction `x-forwarded-for`, valida `GEMINI_API_KEY` env, CORS, `copilotRuntimeNodeHttpEndpoint` endpoint `/api/copilotkit`) y `api/gemini.ts:1` proxy simple fetch para fallback directo — ambas validan payload, sanitizan, nunca exponen key, `vercel.json:6` declara ambas
- Acciones tipadas y validadas (§13) con whitelist + logs dev: `setFilter` (columna existente en `allowedColumns`, operator `equals|contains|gt|lt|between`, value/value2, `addFilter` con `isValidFilter` `src/state/DashboardContext.tsx:49`), `clearFilters`, `setChart` (chartType `line|bar|area|pie`, x/y columnas existentes, `setActiveChart`), `setDateRange` (from/to `Date.parse`, filtra `date` con `gt`/`lt`), `compareValues` (columna whitelist, values 2-5, suma `sales` local), `showInsight` (≤600 chars) — rechazos loggeados `console.warn` + `setError`
- Privacidad §8: solo contexto agregado al LLM (ver `dashboardContext` `CopilotPanel.tsx:19`), nunca filas crudas; `FilteredRows` no enviado, token-efficient `maxOutputTokens` controlado server; raw data permanece en browser (§6)
- CopilotPanel + AIActionIndicator (§16, §28): `src/components/copilot/CopilotPanel.tsx:119` — header con contador, `AIActionIndicator` `role="status"` “Applying filter…” con skeleton (§28), `insightLog` acumulado, `<CopilotChat>` instrucciones “prefer actions”, `Suspense` lazy `src/App.tsx:13` (`React.lazy` CopilotPanel → chunk 705KB separado, index 1.7MB), `src/App.css:100` estilos copilot, `ActiveChartRenderer` `src/App.tsx:22` renderiza chart AI (`bar|line|area|pie` con `toBarData` `src/data/chartAdapter.ts:21`, dismiss)
- Tabs AI Analyst `src/App.tsx:262` ahora mounta `CopilotPanel` lazy; `DashboardContent` muestra `ActiveChartRenderer` cuando `activeChart` seteado por IA

**DoD Fase 3:**
```
[x] CopilotKit provider + useCopilotReadable (agregado) + useCopilotAction (6 acciones) validados
[x] Pregunta "Show me sales from Bogotá" → setFilter city equals Bogotá → dashboard (KPIs/charts/tabla) se actualiza via DashboardContext
[x] Contexto agregado verificable (rowCount/columns/metrics/topProducts/salesByCity/trends/currentFilters) sin filas crudas
[x] Proxy mínimo no backend: rate-limit, sanitiza, protege GEMINI_API_KEY, no endpoints extra
[x] Streaming/error IA manejado: indicador "Applying filter…", CopilotChat streaming, error alert + rate-limit 429, fallback empty sin datos
[x] pnpm build ok (lazy: index 1.7MB + CopilotPanel 705KB), sin Tailwind/shadcn/lucide directo, sin VITE_ secrets
```

### Fase 4 — Polish & Quality Gate — **COMPLETADA 2026-08-21**
**Objetivo:** Cierre de P0 con estándar portfolio-grade antes de P1/P2.

Incluye:
- **Quality Gate §38 auditado completo (verificado `pnpm build` 75KB index + 402KB recharts + 3.4MB copilot lazy):**
  ```
  [x] pnpm install funciona (frozen-lockfile ok)
  [x] pnpm dev funciona (vite 5173, 313ms)
  [x] pnpm build funciona sin errores TS (tsc -b + vite, 10137 modules)
  [x] No hay Tailwind/UnoCSS/Windi — solo CSS nativo + CSS Modules (verificado package.json/src)
  [x] No hay shadcn/ui
  [x] No hay lucide-react/Heroicons/FA — solo pixelarticons 2.4.1 (38 usos)
  [x] No hay scripts npm/yarn/bun — solo pnpm (vercel.json + packageManager pnpm@11.22.0)
  [x] No hay API keys expuestas (grep VITE_* vacío, GEMINI_API_KEY solo en api/*.ts server)
  [x] No hay backend tradicional — solo Vercel Function mínima copilotkit.ts+gemini.ts
  [x] CSV processing local Papa Parse src/data/parser.ts:20, validateFile 15MB
  [x] Demo data public/demo.csv 180 filas funciona <30s (handleDemo fetch)
  [x] Dashboard KPIs/charts/filtros validados (FilterBar whitelist, DataTable paginada, 4 charts)
  [x] AI actions validadas (CopilotPanel whitelist + log, api rate-limit 20/min)
  [x] Responsive desktop>tablet>mobile (kpis 4→2→1, charts 1.4fr→1fr, tabs scroll-x)
  [x] Error handling no pantalla vacía (ErrorBoundary src/components/ui/ErrorBoundary.tsx:1 + error alert retry/demo + empty states)
  [x] Vercel Function solo proxy mínimo (api/copilotkit.ts reflect-metadata + CopilotRuntime + GoogleGenerativeAIAdapter, api/gemini.ts fetch)
  ```
- **Performance §33:** `vite.config.ts:7` `target es2022`, `cssCodeSplit`, `chunkSizeWarningLimit 850`, `manualChunks` react/recharts/copilot → `index 75KB + react 180KB + recharts 402KB + copilot 3.4MB lazy` (antes 1.7MB monolito), `Suspense` lazy CopilotPanel `src/App.tsx:13`, `useMemo` en DashboardContext para filteredRows/metrics/timeSeries, componentes <300 líneas
- **a11y AA §30:** `index.html:2` `lang="en"`, skip-link `src/App.css:2` `.skip-link:focus`, semantic `header/main/nav/table/footer[role=contentinfo]` `src/App.tsx:133`, Radix Tabs/Dialog/Select/Tooltip (keyboard, focus-visible `src/index.css:67` 2px solid), `aria-label/aria-sort/role="status"/aria-live`, `prefers-reduced-motion` `src/App.css:124`, contraste muted #64748b/white ~5:1, pixelarticons `aria-hidden`
- **SEO/meta + favicon §20/§21:** `index.html:1` — `description`, `theme-color #0f172a`, `og:title/description/image`, `twitter:card`, `canonical`, `apple-touch-icon`, `robots`, `author/keywords`; `public/favicon.svg` 9.3KB verificado, `public/demo.csv`
- **Deploy Vercel §11:** `vercel.json:1` framework vite, functions `api/gemini.ts` + `api/copilotkit.ts` includeFiles, `.env.example` con `GEMINI_API_KEY=` server-only, instrucciones `pnpm install/dev/build/preview`

**Definition of Done Fase 4:**
```
[x] pnpm install/dev/build OK sin TS errors
[x] Sin violaciones stack (ver greps)
[x] SEO/meta + favicon verificados
[x] a11y AA + responsive auditados (skip-link, focus, semantic, reduced-motion)
[x] Performance lazy + manualChunks + useMemo
[x] ErrorBoundary + empty states + skeletons
[x] Deploy config verificado
```

### Fase 5 — P1/P2 (Post-MVP, solo con P0 verificado) — **COMPLETADA 2026-08-21**
**Objetivo:** Extender valor sin romper P0. Solo con P0 verificado y sin backend (§5.4, §6, §11).

Incluye:
- **P1 — InsForge local (frontend-first, sin backend, §31):** `src/lib/storage.ts:1` — abstracción `localStorage` compatible InsForge (cuando se añada SDK se hace swap): entidades `SavedDataset {id,name,rowCount,columnCount,createdAt}`, `SavedAnalysis {id,name,datasetName,filters,chartConfig,createdAt,metricsSnapshot}`, `Preferences {anomalyThreshold,anomalyMethod}`, `history` eventos; `getSavedAnalyses/saveAnalysis/deleteAnalysis`, `getSavedDatasets/saveDataset`, `getPreferences/savePreferences`, `appendHistory/clearHistory`; límite 20 analyses/50 history, nunca filas crudas (§8)
- **UI Persistencia:** `src/components/history/HistoryList.tsx:1` — Radix Dialog “About saving (privacy)”, input nombre + `Save analysis` (valida `fileInfo`), lista con `Restore` (dispatch `CustomEvent copixi:restore-analysis` → `App.tsx:19` listener restaura `clearFilters` + `addFilter` + `setActiveChart` + `setActiveTab('overview')`), `Delete`, `Clear history`; flujo `Anonymous → Upload → Demo → Analyze → Save opcional` — no bloquea demo (§31)
- **P2 — Export sin backend (§6, §8):** `src/data/export.ts:1` — `exportRowsCSV` (escapeCSV + Blob + `URL.createObjectURL`), `exportRowsJSON`, `exportChartPNG` (serializa `svg` de Recharts → `Image` → `canvas 2×` → `toBlob` PNG); `src/data/report.ts:1` — `generateMarkdownReport` (KPIs, trends, byCity/Category/Product, filters, rowCounts) + `downloadText` (Blob markdown); `src/components/dashboard/ExportBar.tsx:1` — Radix FilterBar con `Export CSV/JSON/PNG/Download report (.md)`, disabled si no hay datos, nota “Blob locally — no server”
- **Advanced anomaly:** `src/data/anomalyDetection.ts:32` IQR ya existía, ahora UI `src/components/dashboard/AnomalyPanel.tsx:1` — `method zscore|iqr` + `threshold 1.5–4 slider` (badge), `getPreferences/savePreferences`, `appendHistory`, detect `zscore threshold` o `IQR 1.5×`, muestra hasta 8 con zScore y contexto city/product; reemplaza anomalía simple Overview
- **Advanced comparisons:** `src/components/dashboard/CompareTable.tsx:1` — selector `stringCols` (type string), distinct ≤20, pick 2–5 values con `btn-primary/secondary`, tabla `Rows/Sales/Units/Customers` (sum local, no LLM §7); integrado en Insights `src/App.tsx:306` bajo rankings
- **Integración:** `src/App.tsx:8` importa `ExportBar/AnomalyPanel/CompareTable/HistoryList`; `Overview` → `FilterBar + ExportBar + KPIGrid + 4 charts + AI Chart + AnomalyPanel`; `Data` → `FilterBar + ExportBar + DataTable + DataProfiler + HistoryList`; `Insights` → `InsightCard + trend + rankings + CompareTable + ExportBar`; `useEffect` restore handler `src/App.tsx:19`
- **Quality:** `tsc -b` ok (fix `report.ts` unused import + `CompareTable` unused `groupBy`), `vite build` ok `index 90KB + react 180KB + recharts 401KB + copilot 3.4MB lazy` (sin chunks nuevos >850KB salvo copilot esperado), sin Tailwind/shadcn/lucide, sin `VITE_` secrets, sin backend tradicional, sin nuevas deps (§34)

**DoD Fase 5:**
```
[x] Flujo auth opcional no requiere login para demo (HistoryList save es opcional, demo sin login)
[x] Saved analyses persisten (localStorage) y restauran filtros/charts via CustomEvent + DashboardContext
[x] Export CSV/JSON/PNG y report .md funcionan 100% cliente (Blob/canvas) sin backend
[x] Advanced anomaly z-score configurable 1.5–4 + IQR 1.5× con persistencia Preferences
[x] Advanced comparisons tabla lado a lado (2–5 values, sum local) integrada en Insights
[x] pnpm build ok, sin Tailwind/shadcn/lucide, sin VITE_ secrets, sin backend tradicional
[x] §8 privacidad respetada: nunca filas crudas a LLM ni a storage, solo agregado + filtros/config
```

### Fase 6 — Release & Docs (Post-P1/P2) — **COMPLETADA 2026-08-22**
**Objetivo:** Cierre portfolio-grade: README profesional §37, hardening final y documentación de Release sin nueva feature ni backend.

Incluye:
- **README §37:** `README.md:1` — creado como **AI-native data analytics product** (no tutorial): What is Copixi / Problem / Solution (frontend-first + AI actions) / Features P0+P1+P2 / Architecture (Browser Data Engine `src/data/` puras + DashboardState Context + CopilotKit/Gemini/Vercel validated actions) / Privacy (§8 local-only, Blob exports) / Tech Stack tabla §3 / Local dev `pnpm install/dev/build/preview` / Deploy Vercel (`vercel.json` + `GEMINI_API_KEY` server-only) / Quality Gate checklist / Roadmap Fases 0–6; sin `npm`/`VITE_` secrets, solo `pnpm` + `Pixelarticons`
- **Hardening:** verificado `pnpm install/dev/build` ok Node 20, `tsc -b` sin errores, `grep` sin Tailwind/shadcn/lucide/VITE_, `packageManager pnpm@11.22.0`, `vercel.json` framework vite + functions `api/copilotkit.ts+gemini.ts`, `public/demo.csv` 180 filas + `public/favicon.svg`, `src/index.css` tokens §19 + `src/App.css` Linear/Notion sobrio §20, `ErrorBoundary` + empty states + skeletons + responsive + a11y AA
- **Sin features nuevas:** no se añadió backend tradicional (§5.4/§11), no deps nuevas (§34), no breaking change P0–P5; Multiple datasets / jsPDF PDF permanecen P2 opcionales futuros con justificación §41

**DoD Fase 6:**
```
[x] README.md cubre §37 completo (What/Problem/Solution/Features/Architecture/AI/Privacy/Stack/Dev/Deploy)
[x] README presenta como AI-native product, no tutorial; incluye flow DATA→ANALYSIS→AI→ACTION→DECISION
[x] pnpm install/dev/build ok, sin violaciones stack, sin VITE_ secrets, sin backend tradicional
[x] AGENTS.md §42/§43 y timestamp actualizados a 2026-08-22
```

### Fase 7 — Growth & Hire Funnel (Post-Release Comercial) — **COMPLETADA 2026-08-22**
**Objetivo:** Convertir Copixi en embudo de contratación — que la app misma venda al candidato — y cerrar P2 restante “Multiple datasets” + PDF/print sin backend ni nuevas deps.

Incluye:
- **HireBanner:** `src/components/ui/HireBanner.tsx:1` — sticky top `role="banner"` “Built by Juan Xi · Available for hire — Product Engineer (React/TS/AI)” + badge `Frontend-first · AI-native · 0$ infra` + CTAs `LinkedIn — Hablemos` / `Email` + dismiss persistido `copixi:hire-banner-dismissed` (localStorage); montado en `src/App.tsx:1` sobre header, sobre `header` sticky, `zIndex 40`, a11y `aria-label`
- **Multiple datasets (P2 cierre):** `src/lib/storage.ts:62` ya tenía `SavedDataset`, ahora `src/App.tsx:108` `handleRows` guarda metadata `saveDataset({id,name,rowCount,columnCount,createdAt})` en cada upload/demo (solo metadata §8); UI `src/components/history/DatasetSwitcher.tsx:1` — card `Recent datasets` lista 5 últimos con `name · rows · cols · date`, nota privacy + futuro tabs compare; integrado en Data tab `src/App.tsx:306` bajo `HistoryList`
- **Print / Save PDF:** `src/components/dashboard/ExportBar.tsx:1` — añadido botón `Print / Save PDF` (`window.print`) junto a CSV/JSON/PNG/MD; 100% cliente, sin jsPDF ni deps nuevas (§34) — usuario usa “Save as PDF” nativo del navegador (0 KB extra)
- **Comercial coherente:** README comercial §37 ya es embudo; ahora app también lo es — visitante ve hire banner en <2s, demo <30s, export/print y datasets refuerzan valor negocio (retención + profesionalismo)

**DoD Fase 7:**
```
[x] HireBanner visible, dismissible, persistido, sin backend, a11y, no rompe layout
[x] Multiple datasets metadata guardado en cada upload/demo y listado (Recent datasets)
[x] Print / Save PDF funciona 100% cliente sin deps
[x] pnpm build ok, sin Tailwind/shadcn/lucide, sin VITE_ secrets, sin backend tradicional, sin nuevas deps
[x] AGENTS.md §42/§43 y timestamp actualizados a 2026-08-22
```

### Fase 8 — Share & Trust (Viral + Profesional) — **COMPLETADA 2026-08-22**
**Objetivo:** Hacer Copixi compartible y creíble para hiring managers — viralidad sin backend, trust signals sin humo.

Incluye:
- **Shareable URL (100% cliente, §8):** `src/lib/share.ts:1` — `buildShareUrl`/`parseShareUrl`/`copyToClipboard` — serializa solo `filters:Filter[]` + `chart:ChartConfig` via `btoa(JSON)+encodeURIComponent` → `?f=…&c=…` (nunca filas crudas); `src/components/dashboard/ShareBar.tsx:1` — `useEffect` restore on mount (si `rawRows` ya cargado) + `replaceState` sync en cada cambio filters/chart, botón `Copy link` con feedback 2s + `navigator.share` si disponible, nota “Link encodes only filters/chart — no rows”; montado en `src/App.tsx:240` Overview/Data/Insights sobre ExportBar
- **TrustBar:** `src/components/ui/TrustBar.tsx:1` — card `Trusted stack` badges React/TS/Vite/pnpm/Radix/Recharts/CopilotKit/Vercel + claim `Frontend-first · 0$ infra · Privacy by design · Validated AI actions · a11y AA — Portfolio-grade`; integrado en Overview `src/App.tsx:243`
- **Sin deps nuevas (§34):** solo APIs nativas `URLSearchParams`/`btoa`/`clipboard`/`history.replaceState`; `tsc -b` ok, `vite build` ok (incremento ~2KB), sin Tailwind/shadcn/lucide, sin `VITE_` secrets, sin backend

**DoD Fase 8:**
```
[x] URL con ?f=&c= restaura filtros/chart al abrir link (con dataset cargado)
[x] Copy link funciona (clipboard + fallback execCommand)
[x] ShareBar muestra conteo filters + chart type, sync automático via replaceState
[x] TrustBar visible en Overview, refuerza stack y profesionalismo
[x] pnpm build ok, sin nuevas deps, sin backend, privacy §8 respetada
[x] AGENTS.md §42/§43 y timestamp actualizados a 2026-08-22
```

### Fase 9 — Command Palette & Observability (Productivity Pro) — **COMPLETADA 2026-08-22**
**Objetivo:** Profesionalizar el uso diario — atajos teclado, observabilidad local sin backend, y SEO final para portfolio.

Incluye:
- **Command Palette (⌘K):** `src/components/ui/CommandPalette.tsx:1` — Radix Dialog con `Ctrl+K` / `/` toggle, input filtrea comandos, lista `Clear filters` / `Chart Bar city→sales` / `Line date→sales` / `Pie category→sales` / `Export CSV` / `Load demo` (disabled si no aplica), `track('cmd_*')` local, montado en header nav `src/App.tsx:173` junto a links, a11y `aria-label`, trigger dashed `⌘K`, overlay blur
- **Analytics local privada:** `src/lib/analytics.ts:1` — `track(event,detail)` → `localStorage copixi:analytics` (100 eventos max, `ts/event/detail`, `console.log` en DEV), `getAnalytics/clearAnalytics`, sin cookies/backend, §8 compliant; integrado en CommandPalette + futuro para upload/filter events
- **SEO polish:** `public/sitemap.xml:1` — `https://copixi.vercel.app/` + `/#overview` (sitemap estándar), ya existían `index.html` meta/OG/canonical/favicon §20/§21 Fase 4; sin nueva dep, sin backend
- **Sin deps nuevas (§34):** solo Radix Dialog ya existente + Web APIs; `tsc -b` ok, `vite build` ok (~3KB extra), sin Tailwind/shadcn/lucide, sin `VITE_` secrets

**DoD Fase 9:**
```
[x] ⌘K abre palette, filtra comandos, ejecuta acciones validadas (clear/setChart)
[x] Analytics local guarda eventos sin backend ni cookies
[x] sitemap.xml presente y válido
[x] pnpm build ok, sin nuevas deps, sin backend, a11y + responsive intactos
[x] AGENTS.md §42/§43 y timestamp actualizados a 2026-08-22
```

### Fase 10 — Final Audit & 100% Handoff — **COMPLETADA 2026-08-22**
**Objetivo:** Cierre definitivo 100% — auditoría exhaustiva Quality Gate §38, evidencia verificable y handoff portfolio-grade. No nueva feature sin justificación §41.

Auditoría ejecutada 2026-08-22 Node 20:

```
TSC: tsc -b → exit 0 (0 errores)
BUILD: vite build → ✓ built 4.26s, index 101KB + react 180KB + recharts 401KB + copilot 3.4MB lazy (único >850KB esperado), dist 20M
GREPS: tailwind/shadcn/lucide/heroicons/FA → 0 hits (solo Pixelarticons 61 usos)
VITE SECRETS: grep VITE_ en src/api → 0 hits; GEMINI_API_KEY solo en api/gemini.ts + api/copilotkit.ts (process.env, nunca VITE_)
PM: packageManager pnpm@11.22.0, vercel.json build/install pnpm build/install
CSV: public/demo.csv 181 líneas (header + 180 filas), Papa Parse wrapper src/data/parser.ts:1
SEO: public/favicon.svg 9.3KB + public/sitemap.xml 269B + index.html OG/canonical/theme-color (Fase 4)
CSS: src/index.css tokens :root (--color-*, --space-*, --radius-*, etc.) + src/App.css Linear/Notion §19/§20
BACKEND: api/ solo 2 files copilotkit.ts+gemini.ts (proxy mínimo, rate-limit 20/min, sin Express/Nest/Docker)
VERCEL: framework vite, functions includeFiles api/**, output dist
A11Y/RESPONSIVE: skip-link, focus-visible 2px, semantic header/main/nav/table, Radix keyboard, KPIs 4→2→1, TrustBar/ShareBar/HireBanner a11y
PRIVACY: src/lib/share.ts + storage.ts nunca filas crudas, solo filtros/chart (§8)
FEATURES: Landing 2 CTAs + demo <30s, Upload drag&drop, 4 charts con propósito, FilterBar validado, DataTable paginada, Anomaly zscore+IQR, CompareTable, Export CSV/JSON/PNG/MD + Print, Share ?f=&c=, TrustBar, Cmd+K, Analytics local, HireBanner
```

**Cierre:** todas las fases 0–10 verdes, sin TODOs P0, sin violaciones, sin deps nuevas sin justificar (§34). Resta solo deploy `vercel --prod` con `GEMINI_API_KEY` y opcional InsForge SDK swap (`src/lib/storage.ts`). Proyecto listo para presentar a hiring managers como **AI-native product, no tutorial**.

**DoD Fase 10:**
```
[x] pnpm install/dev/build OK re-verificado con evidencia
[x] 0 violaciones stack (greps)
[x] Demo + favicon + sitemap + tokens verificados
[x] Backend mínimo verificado (solo 2 Vercel Functions)
[x] Features P0+P1+P2+Growth (Fases 7-9) intactas y build ok
[x] AGENTS.md §42/§43 y timestamp cerrados a 2026-08-22 — 100% Handoff
```

### Reglas de ejecución por fase
1. Un agente trabaja una fase por vez, respeta §39 y §41.
2. Cada fase actualiza `AGENTS.md` §42 con estado (Pendiente / En curso / Completada + fecha).
3. Commits pequeños por fase (`feat: fase1 landing`, `feat: fase1 data engine`, etc.) §36.

---

## 43. Resultado Esperado — Estado Actual

- **Fase 0:** Completada (2026-08-21)
- **Fase 1:** Completada (2026-08-21) — verificado `pnpm build` sin errores TS, demo <30s, upload drag&drop, KPIs+charts, profiler, sin violaciones de stack
- **Fase 2:** Completada (2026-08-21) — DashboardState Context, FilterBar validado, DataTable paginada, 4 charts con propósito, Tabs, Insights, responsive + a11y, build ok
- **Fase 3:** Completada (2026-08-21) — CopilotKit + Gemini proxy validado, 6 AI actions, contexto agregado sin filas, AI panel + streaming, build ok con lazy
- **Fase 4:** Completada (2026-08-21) — Quality Gate auditado, SEO/meta/favicon, a11y AA + responsive final, performance lazy+manualChunks, ErrorBoundary, deploy verificado
- **Fase 5:** Completada (2026-08-21) — P1 InsForge local (localStorage abstraction, no backend, §31) + P2 export/report/anomaly/comparisons (§32): saved analyses persist+restore, ExportBar CSV/JSON/PNG+report .md (Blob/canvas), AnomalyPanel zscore+IQR configurable, CompareTable lado a lado, history local, build ok sin violaciones
- **Fase 6:** Completada (2026-08-22) — Release & Docs (§37): README comercial + técnico para venta laboral (AI-native product pitch: hook contratación, propuesta de valor frontend-first 0$ infra, IA token-eficiente, tabla “por qué contratarme”, demo <30s, arquitectura y privacy como argumento de negocio, stack, pnpm, deploy Vercel), hardening final, deploy verificado, Quality Gate final pass
- **Fase 7:** Completada (2026-08-22) — Growth & Hire Funnel: HireBanner sticky + multiple datasets (metadata local) + Print/Save PDF (window.print, 0 deps), app ahora es embudo comercial, build ok sin violaciones
- **Fase 8:** Completada (2026-08-22) — Share & Trust: URL compartible ?f=&c= (solo filters/chart, sin filas §8) + Copy link + TrustBar stack badges, sin backend ni nuevas deps, build ok
- **Fase 9:** Completada (2026-08-22) — Command Palette (⌘K) + Analytics local privada + sitemap.xml, sin backend ni nuevas deps, build ok
- **Fase 10:** Completada (2026-08-22) — Final Audit 100% Handoff: Quality Gate §38 re-auditado con evidencia (tsc 0, build 4.26s, 0 violaciones, demo 180 filas, 61 pixelarticons, pnpm, 2 Functions mínimas), proyecto cerrado portfolio-grade
- **Fase 11 — Mascota Sticky + RAG + TTS:** Completada (2026-08-22) — Plan `.kilo/plans/1787439634339-mascota-sticky-rag-copilotkit.md`: mascota sticky en dashboard (desktop right panel + mobile fixed), TTS nativo con `speechSynthesis`, panel derecho unificado con mini resumen + botón expandir chat, ChartAdapter genérico (detección dinámica de columnas date/numeric/categorical, scatter sugerido), RAG local con `@xenova/transformers` (MiniLM embeddings, búsqueda semántica top-K, cache memoria, 500 filas max, lazy import), acción `ragQuery` en CopilotPanel + contexto enriquecido en `useCopilotReadable`, DashboardContext extended con `embeddingStatus`/`topSimilarRows`/`ragQuery`, privacidad §8 respetada (embeddings en browser, solo snippets al LLM), build ok con transformers code-split (~189KB gzip)

- **Fase 12 — CopilotKit v1→v2 + A2UI (2026-08-23):** Completada — Upgrade del layer de IA usando las skills `copilotkit-upgrade`, `a2ui-renderer`, `react-core`, `runtime`. Cambios: provider `CopilotKit` desde `@copilotkit/react-core/v2` (estilos `@copilotkit/react-core/v2/styles.css`, se elimina `@copilotkit/react-ui`); acciones de frontend migradas `useCopilotAction`→`useFrontendTool` con esquemas **zod**; contexto `useCopilotReadable`→`useAgentContext` (valor debe ser `JsonSerializable`, se serializa con `JSON.parse(JSON.stringify(...))`); chat `CopilotChat` desde `@copilotkit/react-core/v2` con `agentId="default"` (v2 no admite prop `instructions` en `CopilotChat` → instrucciones del agente movidas a `BuiltInAgent({ prompt })` en el runtime). Runtime `api/copilotkit.ts` migrado a `CopilotRuntime` + `BuiltInAgent` (modelo `google/gemini-3.5-flash-lite`, `apiKey: process.env.GEMINI_API_KEY`, `maxSteps: 6`) + `createCopilotRuntimeHandler` (fetch) adaptado a la firma Node `req/res` de Vercel vía `Readable.toWeb`/`fromWeb`; `InMemoryAgentRunner`; rate-limit 20/min mantenido. **A2UI habilitado:** `runtime.a2ui = {}` + provider `a2ui={{ theme, catalog }}` con catálogo custom `src/copilot/a2uiCatalog.tsx` (`createCatalog` de `@copilotkit/a2ui-renderer`: componentes `InsightCard`/`KpiStat` themed con tokens de Copixi). Verificado: `pnpm build` ok (tsc -b + vite), `pnpm lint` ok (solo warnings previos), y smoke-test del runtime `/api/copilotkit/info` retorna `a2uiEnabled: true`. **Limitación de la key Gemini provista:** autentica contra Google pero el proyecto asociado devuelve 404 (`gemini-2.5-flash` "no longer available to new users") y 403 ("denied access") para toda la familia `gemini-3.x` — i.e. la key no tiene ningún modelo con `generateContent` habilitado, por lo que el agente no puede generar respuestas hasta que se habilite un modelo en ese proyecto o se use una key con acceso. El wiring es correcto y funcionará con cualquier key/modelo con acceso.

- **Fase 13 — Copilot Excel Redesign: sin CopilotKit + Vercel AI SDK + paleta naranja (2026-08-24):** Completada — Reemplazo total de CopilotKit por chat propio ligero. Plan `.kilo/plans/1787589678642-copilot-excel-redesign.md`. Cambios: (1) Deps: se eliminan `@copilotkit/a2ui-renderer`, `@copilotkit/react-core`, `@copilotkit/runtime`, `reflect-metadata`; se añaden `ai`, `@ai-sdk/react`, `@ai-sdk/google`, `@ai-sdk/openai` (Vercel AI SDK v7). (2) Backend único `api/chat.ts` (reemplaza `api/copilotkit.ts` + `api/gemini.ts`): `streamText`/`generateText` con `createGoogle('gemini-1.5-flash')` primario y fallback `createOpenAI`→OpenRouter (`openrouter/auto-beta`) si falta `GEMINI_API_KEY`; maneja 3 formas (chat SSE vía `toUIMessageStreamResponse`, `mode:'summary'`, `mode:'extract'` con contexto agregado §8), rate-limit 20/min, nunca expone keys. (3) Frontend: `ExcelChat.tsx` usa `useChat` (`@ai-sdk/react`) + `DefaultChatTransport` con `prepareSendMessagesRequest` que inyecta contexto agregado vía ref; parsea bloque JSON `{action:...}` al final y lo valida contra `allowedColumns`/`isValidFilter` (reutilando lógica de `DashboardContext`) antes de `addFilter`/`clearFilters`/`setActiveChart`/`setDateRange`. (4) TTS: `src/lib/tts.ts` extrae la cola de Web Speech API de `Mascota.tsx`; `mascotaSpeak` expuesto en `window`; mute persistente en `localStorage`. (5) Mascota: `MascotaMood` extendido (`escuchando`/`pensando`/`exito`→`exito` semántico) + moods CSS nuevos; tokens slime remapeados a naranja. (6) Paleta blanco/negro/naranja: `--color-primary:#ff6b00`, tokens slime naranja, `ChartRenderer` y gráficos usan `#ff6b00`. (7) Layout: `hero-excel` (mascota top-center 200px + `ExcelChat` max 720px) + `data-layer` colapsable (FilterBar, charts-full autoCharts, SummaryCard, DataTable, DataProfiler, ExportBar) con toggle. (8) `main.tsx` ya no envuelve en `<CopilotKit>`; `CopilotPanel`/`a2uiCatalog`/`A2uiChart` eliminados; `DashboardContext.generateSummary` y `App.parseFile` migrados a `/api/chat`. Verificado: `pnpm build` ok (bundle principal ~266KB/77KB gzip + recharts 417KB; **se eliminó el chunk CopilotKit de ~3.4MB**), `pnpm lint` ok (solo warnings), `grep` sin CopilotKit/Tailwind/shadcn/lucide/VITE_ en src. **Nota modelo:** `gemini-1.5-flash` elegido porque la key documentada falla para `gemini-2.5-flash` y familia `gemini-3.x` (§43 Fase 12); si `gemini-1.5-flash` tampoco está habilitado en el proyecto, el backend hace fallback a OpenRouter si existe `OPENROUTER_API_KEY`, sino retorna error 500 amigable.

- **Fase 14 — Pipeline de Búsqueda RAG + Conexión con /api/chat (citas verificables) (2026-09-11):** Completada — Cierra el contrato "Top 15 vectorial + Top 15 MiniSearch → fusión RRF → Top 3 / fallback Top 3 MiniSearch directo → inyección a `chat.ts` → streaming con citas `[Pág. N]`". Cambios: (1) Nuevo `src/lib/ragPipeline.ts` (`runRagPipeline(query, topK=3)`, `RAG_TOP_K=3`, `RAG_CANDIDATES_PER_CHANNEL=15`, `RAG_MAX_CHARS_PER_HIT=1200`): hace explícito y verificable el contrato — delega en `ragClient.search(query, 3)` (el worker `src/workers/rag.worker.ts:handleSearch` ya resolvía híbrido 15+15→RRF k=60→Top3 y `searchMainThread` el fallback léxico Top3 + watchdog), normaliza hits (página válida, texto truncado) y expone `mode` (`hybrid`/`lexical_only`) + `usedFallback`. (2) `api/chat.ts:buildContextBlock`: tope `slice(0, 3)`, ≤1200 chars por fragmento con `…`, formato `[Fragmento i | Pág. N]`, instrucción al modelo de citar con formato `[Pág. N]`. (3) `src/components/excel/ExcelChat.tsx`: usa `runRagPipeline`, adjunta `searchMode` al mensaje del asistente durante el streaming SSE, parsea citas inline `[Pág. N]`/`[Página N]`/`[p. N]` a pills (`citation-inline`), badges de fuentes convertidos a `<details>` expandibles con snippet + `matchType`, etiqueta de modo `híbrida (vectorial + léxica → RRF)` vs `léxica` en burbuja e historial; estilos en `src/App.css`. §8 respetada (solo 3 fragmentos al LLM, nunca el documento). Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes, sin nuevas deps (§34), sin backend nuevo (§11).

- **Fase 15 — Mascota personalizable con Blobatar (2026-09-11):** Completada — La mascota acepta cara personalizable sin reemplazar su sistema de moods. Cambios: (1) Deps `blobatar@2.7.0` + `@blobatar/react@2.7.0` (MIT, ~4.4 KB core + adapter, cero dependencias, peer `react>=18` compatible con React 19; justificación §34: avatar determinista SVG que no se reimplementa en ~20 líneas; `motion.css` de terceros aceptado por no tener equivalente nativo y respetar `prefers-reduced-motion`). (2) `src/types/mascota.ts`: `'blobatar'` en `MascotVariant`. (3) `src/components/ui/Mascota.tsx`: rama `variant="blobatar"` — `<Blobatar name animate="hover" size>` dentro del mismo wrapper (`mood-*`, subtítulos, TTS, `aria-label` con nombre). (4) `src/components/ui/MascotCustomizer.tsx` (nuevo): toggle Cara Robot / Mi avatar + input de nombre (máx. 24, sanitizado, preview en vivo, radiogroup a11y). (5) `src/lib/storage.ts`: `Preferences` += `mascotFace` + `blobatarName` (default `'compe'`), `getPreferences` fusiona defaults (migra prefs antiguas); `src/App.tsx` levanta el estado, persiste en `savePreferences` y pasa `variant/avatarName` a `Mascota`. Sin backend, sin fetch externo (paquete local, §8). Verificado: `pnpm build` ok (+~14 KB chunk principal), `pnpm lint` solo warnings preexistentes.

- **Fase 16 — Robot único personalizable (adiós Pipeline/Especialista) (2026-09-11):** Completada — Se elimina toda la UI de `🔄 Pipeline Asistido / 🤖 Modo Especialista` (stepper 5 pasos, dock de especialistas, tarjeta de limpieza Helix): borrados `src/components/dashboard/RobotEcosystemControls.tsx` + `.css` y su montaje en `src/App.tsx`. Limpieza en `src/state/DashboardContext.tsx`: fuera `AnalysisMode`/`PipelineStep`, `analysisMode`/`activeRobot`/`pipelineStep`/`cleaningHistory`/`lastCleaningResult`/`cleaningDiagnosis`, `applyCleaning`/`undoCleaning` y el import de `src/data/cleaner.ts` (el módulo queda como engine puro sin consumidores). Sin perder robots: las 7 unidades (`ROBOT_UNITS`) pasan al `MascotCustomizer` (`src/components/ui/MascotCustomizer.tsx`) como selector de unidad + toggle Robot/Mi avatar + nombre Blobatar; `Preferences` += `mascotRobot` (default `helix`); `App.tsx` levanta `mascotFace/mascotRobot/blobatarName` y renderiza un solo `Mascota` a `size={260}` (antes 180) con layout en columna. Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes, sin nuevas deps, sin backend.

- **Fase 17 — Pivot a PDF-only (2026-09-11):** Completada — Copixi trabaja exclusivamente con PDF; eliminados CSV/Excel/Word, demo y dashboard tabular. Autorización y justificación §41: `Current approach: AI Data Analyst multiformato (CSV/Excel/PDF) con dashboard tabular. Problem: el uso real es solo PDF+RAG; el resto es superficie muerta. Proposed change: app solo-PDF (mascota + lectura + chat con citas). Why: orden directa del usuario + simplicidad (§40.1). Trade-offs: se pierden KPIs/charts/export/demo; el motor tabular queda como engine puro sin UI. Impact on: [producto §1/§7/§22/§25/§26 | stack §3: fuera Papa Parse/xlsx/Recharts | privacidad §8 intacta]`. Cambios: (1) `src/App.tsx`: upload solo `.pdf`, fuera `handleDemo`/`try-demo`, fuera `handleRows` + rama tabular/`extract`, fuera sección `data-layer` + `ChartRenderer`, textos a PDF (`Cargar PDF`, `Analista de documentos PDF`, dropzone solo-PDF). (2) `src/data/universalParser.ts`: reescrito solo-PDF (validación `.pdf` 30 MB). Borrados: `data/parser.ts`, `data/extractors/excel.ts`, `data/report.ts`, `data/export.ts`, `public/demo.csv`, `dashboard/{ChartCard,FilterBar,ExportBar,SummaryCard}.tsx`, `data/{DataTable,DataProfiler}.tsx`, `splash/*`. (3) `src/components/excel/ExcelChat.tsx`: fuera MiniChart/acciones/tabular-context (nombres internos `excel-*` conservados, no visibles); sugerencias, placeholder, adjuntar y bienvenida a PDF. (4) `api/chat.ts`: `EXCEL_SYSTEM` reescrito a analista PDF-only (sin fórmulas Excel ni bloques de acción). (5) Deps desinstaladas: `papaparse`, `xlsx`, `@types/papaparse`, `recharts` (bundle principal 195→82 KB). (6) `index.html`: title/meta/OG a `Your PDF AI Analyst`. Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes, sin Tailwind/shadcn/lucide, sin `VITE_` secrets, 1 sola Vercel Function.

- **Fase 18 — P0 UI: visor con salto a cita + copiar/.md + errores accionables (2026-09-11):** Completada — Recomendación de la skill `frontend-design` (instalada en `.agents/skills/`): cerrar el loop cita→fuente. Cambios: (1) `src/components/pdf/PdfViewer.tsx` (nuevo): `PdfViewerDialog` con Radix Dialog (ya era dep) — renderiza la página en `<canvas>` vía pdfjs-dist (worker ya configurado, sin nuevas deps), nav anterior/siguiente, `aria-label` por página, cleanup con `destroy`; estilos en `src/App.css`. (2) `src/App.tsx`: guarda `pdfFile`, escucha `copixi:goto-page` y abre el visor en esa página; detecta PDF escaneado (`fullText` vacío → mensaje accionable) y contraseña (`PasswordException` → mensaje accionable). (3) `src/components/excel/ExcelChat.tsx`: pills `[Pág. N]` convertidas a botones + `Ver página →` en snippets (evento `gotoPage`); fila `ai-actions-row` con Copiar (clipboard + fallback `execCommand`) y Descargar `.md` (pregunta+respuesta+fuentes) por respuesta e historial; `AbortError` de Detener ya no muestra error; hints extendidos (429, offline/`fetch`, 502). Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes, sin nuevas deps (§34), sin backend (§11).

- **Fase 19 — P1: biblioteca, buscar-en-PDF, historial y markdown real (2026-09-11):** Completada — Segundo bloque recomendado por `frontend-design`. Cambios: (1) Biblioteca de recientes: `src/lib/docLibrary.ts` (bytes en OPFS `copixi_docs/`, metadatos en `localStorage` máx. 10 con LRU, sin backend §8) + `src/components/pdf/DocLibrary.tsx` (select de recientes + quitar) montado en la top-bar de `src/App.tsx`; re-abrir re-extrae y re-indexa sin duplicar entradas (`skipLibrarySaveRef`). (2) Buscar en el documento: `ragClient.searchPages(query, 20)` (MiniSearch local, ordenado por página) + `DocSearch` dentro del visor + botón `🔍 Buscar en el documento` (evento `copixi:open-viewer`). (3) Historial por documento: `ChatHistoryMsg` + `get/save/clearChatHistory` en `src/lib/storage.ts` (30 msgs, 1500 chars, tolerante a quota) con carga/guardado en `ExcelChat.tsx` por `docId`. (4) Follow-ups dinámicos: `suggestFollowUps` (top-2 términos propios capitalizados, sin LLM) que reemplazan las sugerencias del dock al completar respuesta. (5) Markdown real: `renderRichText` ahora parsea fences ` ``` ` y tablas `|…|` (+ estilos `.ai-table`/`.ai-code` en `src/App.css`). Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes, sin nuevas deps (§34), sin backend (§11).

- **Fase 20 — P2: modo oscuro, botones base y personalizador colapsable (2026-09-11):** Completada — Último bloque de `frontend-design`. Cambios: (1) Modo oscuro automático vía `prefers-color-scheme`: remapeo de tokens en `src/index.css` (`color-scheme: dark`, superficies `#0b0f16/#131a24/#1b2431`, texto `#e9eef5`, muted `#96a3b8` AA, primario `#ff7a1a`) + bloque `@media` al final de `src/App.css` para superficies con color fijo (canvas, top-bar, burbuja, dock, citas ámbar oscuro, visor, tablas, errores) + `index.html` `color-scheme: light dark`; el canvas del visor queda blanco (página real). (2) Sistema base `.btn` en `src/App.css` (las clases `btn/btn-primary/btn-secondary/small` se usaban sin estilos — botones nativos) + estilo `.hero-error`; todo token-driven, válido en ambos modos. (3) Personalizador colapsable: botón `⚙ Personalizar robot` (`aria-expanded`) en `src/App.tsx`, el `MascotCustomizer` solo monta al abrir. (4) Tipo hero: `dropzone-title` a 17px/800/-0.02em. Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes, sin nuevas deps (§34), contraste AA preservado (§30).

- **Fase 24 — Embeddings locales persistentes + briefing + voz (2026-09-11):** Revisa el plan vectorless: se conserva el híbrido. Hitos: (a) **24A Completada** — huella estable del archivo: nuevo `src/lib/fileHash.ts` (`hashPdfFile`, FNV-1a sobre nombre|tamaño|±64 KB, ~1 ms) → `PdfExtractOptions.docId?` en `src/data/extractors/pdf.ts` (antes aleatorio por extracción) → `src/App.tsx` la calcula y la pasa (log DEV del docId); mismo archivo = mismo docId = chunk IDs estables, base para la caché OPFS de 24B. (b) **24B Completada** — lectura OPFS en el worker: nuevo `loadVectorsFromOPFS(docId)` en `src/workers/rag.worker.ts` (acepta formato nuevo header `[count, dim]` + legacy `[count]` con dim 384, valida longitud exacta y cobertura total de chunk IDs); `handleIndexDocument` la intenta tras el índice léxico y si acierta salta la vectorización → `INDEX_COMPLETE hybrid` + progreso `vectors_cached` ("sin recompute"); `saveVectorsToOPFS` ahora guarda `[count, dim]`. Primera apertura vectoriza y guarda; siguientes recuperan del disco. Verificado: `pnpm build` ok, `pnpm lint` sin warnings nuevos, sin nuevas deps. (c) **24C Completada** — briefing proactivo: `api/chat.ts` modo `summary` con rama PDF (exactamente 3 puntos, respuesta directa primero, citas `[Pág. N]`, tope 8000 chars existente); nuevo `src/components/pdf/BriefingCard.tsx` (puntos clicables al visor, skeleton "Leyendo lo esencial…", nulo si falla); `src/App.tsx` lo pide tras indexar (`loadBriefing`, muestra de 4000 chars, degradado silencioso) y lo monta sobre el chat (+ estilos token-driven en `src/App.css`, válidos en modo oscuro). Verificado: `pnpm build` ok, `pnpm lint` sin warnings nuevos, sin nuevas deps. (d) **24D Completada** — entrada de voz: botón 🎙️ en el dock con Web Speech API (`es-ES`, `interimResults`, ~40 líneas, tipos propios sin `any`, sin deps), dictado → input → envío manual; oculto sin soporte (`SpeechRecognition`/`webkitSpeechRecognition`), `aria-pressed`, deshabilitado durante streaming, cleanup con `abort` al desmontar; estado `recording` con pulso rojo + `prefers-reduced-motion` (claro/oscuro). Verificado: `pnpm build` ok, `pnpm lint` sin warnings nuevos. **Fase 24 cerrada.** assistant-ui descartada con justificación §34/§40.

- **Fase 25 — Auditoría fuerte E2E + correcciones (2026-09-11):** Completada — Testeo con Chromium headless (Playwright, PDF de prueba de 2 páginas, 16 checks: carga, upload, indexado, pill, biblioteca, error 404 accionable, visor, búsqueda local, reapertura OPFS, modo oscuro, mobile, voz) + revisión estática (secrets, bundle, console) + auditoría lógica. Hallazgos y fixes: (1) **Iconos Pixelarticons invisibles en toda la app** — el woff2 con `<i>` vacíos no renderizaba ningún glifo: nuevo `src/components/ui/Icon.tsx` (componentes React SVG de `pixelarticons/react`, tree-shakeados), reemplazo en App/ExcelChat/ErrorBoundary/MascotCustomizer, fuera `@font-face`, preload y `public/pixelart-icons-font.woff2`. (2) **Emoji críticos con tofu** (📄📚🔍🎙️) en sistemas sin fuente emoji → reemplazados por Icon/texto. (3) **Welcome eliminado** (pedido previo pendiente): fuera header `compe`, saludo, Escuchar, subtext, Buscar y chips; controles de voz reubicados al dock; idle con doc = línea compacta. (4) **`indexDocument` prematuro**: retornaba al postear → "¡Listo!" antes de tiempo y el complete posterior sobrescribía el subtítulo; ahora espera al `INDEX_COMPLETE` real (resolvers por docId + timeout 180s). (5) **Mezcla de contextos** al cambiar de PDF a mitad de búsqueda/streaming → `queryDocId` fijado + descarte silencioso; `lastQueryRef` se limpia al cambiar de doc. (6) **Carrera del briefing** (tarjeta tardía pisaba al doc nuevo) → contador `briefingReqRef` + cancelación lo invalida. (7) **Doble upload solapado** → aborta la carga anterior. (8) **Fuga en rate-limit** (`api/chat.ts`, mapa por IP sin purga) → tope 2000 entradas. (9) **Overflow mobile 49px** por el botón de mute en el dock → `min-width: 0` en dock e input. (10) **`lang="en"`** con contenido español → `lang="es"`. (11) **Contexto tabular muerto** (395 líneas, cero consumidores UI): `DashboardContext.tsx` reducido a `{error, loading, pdfDoc}`; borrados `data/{profiler,statistics,transformations,anomalyDetection,chartAdapter,cleaner}.ts`, `lib/{rag,embeddings,analytics,share}.ts`. (12) **Ref durante el render** (`docIdRef`, cazado por oxlint) → movido al efecto. Resultado: **16/16 E2E**, `pnpm build` ok, lint sin warnings nuevos, bundle principal ~116 KB. Andamiaje de test retirado (`playwright-core` desinstalado, sin rastros en `package.json`).

Histórico: antes de 2026-08-21 el entregable era únicamente `AGENTS.md`. Desde Fase 1 el proyecto es código ejecutable frontend-first; `AGENTS.md` permanece como contrato vivo. Fase 10 certifica 100% — sin fases pendientes.

- **Fase 26 — Rediseño natural + robot por semilla + tutorial (2026-09-12):** Completada — Skill `frontend-design`, dirección "conversacional humano". Autorización y justificación §41: `Current approach: estética SaaS técnica (naranja eléctrico, 7 unidades robot como personajes, jerga "fragmentos/RRF/vectorial"). Problem: se siente máquina, no invita a conversar. Proposed change: (1) paleta papel/tinta + robot único con rostro cálido + copy humano; las 7 unidades dejan de venderse como personajes y quedan como chasis legacy + presets. Why: orden directa del usuario + simplicidad (§40.1). Trade-offs: se pierde el lore de unidades como identidad; se gana cercanía. Fuente display Fraunces con fallback Georgia local (sin fetch externo, sin nueva dep). Impact on: [visual §19/§20 | copy ES | privacidad §8 intacta]`. Hitos: **A** tokens papel `#FAF6EF`/tinta `#1C1917`/terracota `#B34A24` (AA 4.97, oscuro `#171310`/`#E0784A` 6.12) + grano SVG inline + `--font-display` + `theme-color`; **B** `src/lib/robotSeed.ts` (FNV-1a, 6 diseños Brasita/Miel/Salvia/Tinta/Arena/Cobre cada uno con ojos+accesorio propios, `designFromName`) + `Preferences += {userName, robotName, robotConfig}` con migración; **C** rostro cálido (visor marrón, parpadeo 4.6s, mejillas 35%, respiración 6s, mirada suavizada, accesorios libres antena/aletas/auriculares/mota, tamaño 260→180, insignia con diseño); **D** personalizador con preview vivo + pastillas de diseño + ojos/extra + nombre-con-semilla (override manual) + 🎲 aleatorio + unidades legacy como chasis; **E** `src/components/onboarding/OnboardingTour.tsx` (Radix Dialog, 3 pasos, nombre usuario + bautizo robot con preview vivo, flag `copixi:onboarded`, reabrible "¿Cómo funciona?", saludo con nombre en subtítulo+voz+click); **F** burbuja sin cola/borde 2px (grano, radio asimétrico, serif 15.5px/1.65/62ch), dock píldora, citas tinta tranquilas ("Lo encontré en · búsqueda combinada"), TTS primera frase, copy humano en progreso/errores/pill/marca; **G** motion único `riseIn` 200ms + barra progreso 3px + `%` atenuado + auditoría (build ok, 0 violaciones stack, 0 `VITE_`, bundle ~129 KB). Fix colateral: `api/chat.ts` usaba `import.meta.env` en contexto Node (rompía `tsc`) → `process.env.NODE_ENV`. Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34), sin backend (§11). Ampliación posterior (2026-09-12): 9 diseños (Oliva/Ciruela/Niebla en paleta) + ojos `sleepy`/`big` + accesorios `glasses`/`bow`/`cap`; `finishOnboarding` tipado con `RobotConfig`; segunda ampliación: 10 diseños más en paleta (Teja/Mostaza/Musgo/Vino/Petróleo/Lavanda/Café/Melocotón/Pizarra/Lino, 19 diseños con combos ojos+accesorio únicos verificados); build ok.

- **Fase 27 — Auditoría RAG E2E + fix CSP crítico (2026-09-12):** Completada — Test con Chrome headless vía CDP (PDF de 3 páginas con término único por página, mock SSE de `/api/chat`, captura de bodies). Evidencia: (1) embeddings 100% locales — `@xenova/transformers` empaquetado en `rag.worker` (872 KB), modelo MiniLM descarga al navegador, vectorización en worker, caché OPFS; (2) híbrido correcto — "JIRAFAS VOLADORAS" → p2 primero `hybrid` (léxico rank 1 + vector rank 1, RRF 0.03279), ranking correcto en 2ª query; (3) el LLM recibe exactamente 3 fragmentos con `pageNumber`+`matchType` (bodies capturados) y el backend los inyecta como `[Fragmento i | Pág. N]` con instrucción de cita; (4) fallback `lexical_only` honesto ("búsqueda literal") con CDN bloqueado. **Hallazgo crítico:** el CSP de `vercel.json` (`connect-src` sin huggingface/jsdelivr) BLOQUEABA la descarga del modelo en producción — todo usuario live caía a léxico silencioso (localhost no tiene CSP, por eso nunca se vio). Probado con control negativo (CSP viejo → violación CSP en logs + `lexical`) y positivo (CSP nuevo → `hybrid`, 0 violaciones) sobre build PROD servido con las cabeceras exactas de Vercel. Fix: `connect-src += https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net` (el `*.hf.co` cubre el XET bridge `us.aws.cdn.hf.co` de los blobs, descubierto en la 2ª iteración del test). Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes. Requiere redeploy (push → Vercel) para tomar efecto en live.

- **Fase 28 — Test live + fixes honestidad RAG (2026-09-12):** test contra `https://copixi.vercel.app/`: (1) `/api/chat` OK — el LLM responde (200, SSE válido); (2) **CSP live desactualizada** — el deploy servía `connect-src` sin huggingface/jsdelivr (fix de Fase 27 en `vercel.json` local sin desplegar): en producción el modelo no podía descargarse y todo caía a `lexical_only` silencioso → redeploy requerido; (3) fixes: `ragClient.didLastSearchUseFallback()` — el watchdog marcaba fallback sin reflejarlo y la UI mentía "búsqueda combinada" (`ragPipeline` ahora usa el flag real); `api/chat buildContextBlock` inyecta `searchMode` al prompt. Verificado: `pnpm build` ok, `pnpm lint` solo warnings preexistentes.

- **Fase 29 — Test fuerte post-push (2026-09-12):** 13 checks contra live tras el redeploy, todos verdes: (1) CSP live ya incluye `huggingface.co/*.huggingface.co/*.hf.co/cdn.jsdelivr.net`; (2) MiniLM alcanzable (config.json 200 tras redirect, jsdelivr 200); (3) chat con `ragHits hybrid` responde desde el fragmento y cita `[Pág. 2]`; (4) `lexical_only` + pregunta no respondible → negativa transparente con cita, sin inventar (inyección `searchMode` verificada); (5) `summary` → 3 puntos con citas; (6) bundle live `index-Uy-WN9xf.js` = hash del build local + contiene `didLastSearchUseFallback` (deploy al día); (7) bordes `405/415/400/403/413` correctos; (8) `rag.worker-DyB4LUuk.js` 872 KB servido live (transformers+onnxruntime inline); (9) rate-limit: 200s hasta el tope y luego `429`s. Sin fixes necesarios; `pnpm build` ok.

- **Fase 30 — Split layout chat | documento (Fase A del plan gráficas) (2026-09-13):** con documento cargado la vista pasa a 2 columnas: chat a la izquierda + panel PDF persistente a la derecha (`PdfViewerPanel`, mismo motor que el diálogo: `PdfViewerBody` extraído como componente reutilizable sin cromo). Las citas `[Pág. N]` navegan al panel sin modal (reabren el panel si estaba oculto + scroll en mobile); el diálogo modal se conserva para `copixi:open-viewer` y mobile. Toolbar del panel con hueco reservado `Generar gráfica` deshabilitado (tooltip "próximamente", Fase E) + botón `Ocultar` (vuelve a vista centrada, reabrible con `Mostrar documento`). Responsive: 1 columna <900px. `main-canvas.wide` 1280px en split. Verificado: `pnpm build` ok (+~2 KB), `pnpm lint` sin warnings nuevos, sin nuevas deps (§34), sin backend (§11).

- **Fase 31 — Cita → resaltado por búsqueda de texto, Fase B (2026-09-14):** clic en una cita abre la página en el panel y resalta el fragmento fuente en amarillo. Cambios: `PdfViewerBody` renderiza `TextLayer` invisible de pdf.js sobre el canvas (solo búsqueda/resaltado, sin cambiar diseño; si falla, la página sigue visible); `src/lib/highlight.ts` (`normText` sin tildes/case/signos + `matchHighlightSpans`: frase 8→6→4 palabras con stopwords conservadas, fallback a palabras ≥4 letras, tope 24 spans, nunca lanza); evento `copixi:goto-page` con `{page, query?}` (número plano legacy aceptado) — los botones `Ver página →` pasan el snippet, las pills inline solo navegan; miss honesto ("Fragmento no localizado en esta página…"); navegación manual / documento nuevo limpian el resaltado; scroll respeta `prefers-reduced-motion`; CSS válido en modo oscuro. Verificado: suite 10/10 sobre la lógica real (`tsc` + node), `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34), sin backend (§11). DoD 8/10 en PDF real pendiente de prueba manual en live.

- **Fase 32 — Chart-JSON nativo, Fase C (2026-09-14):** el modelo puede cerrar su respuesta con ```chart-json y la app lo dibuja con SVG propio, sin librerías. Cambios: `src/lib/chartJson.ts` (schema congelado `{chartType: bar|line, title, unit?, data: [{label, value, sourcePage}]}`, máx. 12 puntos con truncado, value finito con coerción de strings numéricos, `splitChartBlock` tolerante — solo fence `chart-json`, sin cierre → hasta fin de texto, saneo de controles literales antes de `JSON.parse`, nunca lanza); `api/chat/index.ts` `EXCEL_SYSTEM` += regla de gráficas (solo si la pregunta pide comparación/evolución Y los fragmentos traen las cifras; "solo cifras literales, prohibido calcular/redondear/estimar"); `src/components/charts/ChartCard.tsx` (SVG 560×340 responsive, barras con baseline en 0 y soporte de negativos, línea con puntos, eje Y con máximo "bonito", etiquetas rotadas, tabla `sr-only` para lectores, fuentes `[Pág. N]` como botones goto-page; colores por tokens, válido en oscuro); `ExcelChat` extrae el bloque ANTES de sanitizar (el escape rompería el JSON), render en burbuja + historial con `React.lazy` (chunk `ChartCard` 3.32 KB separado), TTS/copiar/`.md` usan prosa sin el fence. Verificado: suite 9/9 sobre la lógica real, `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34), sin backend nuevo (§11). Pendiente Fase D (verificador) antes de fiarse de las cifras.

- **Fase 33 — Verificador determinista de cifras, Fase D (2026-09-14):** ninguna gráfica muestra un número que no exista en el documento. Cambios: `src/lib/verifyChart.ts` (`canonNumberToken`: quita separadores de miles es/en y unifica decimal a punto; `verifyChartSpec`: cada `value` debe existir como token numérico completo en los chunks de su `sourcePage` — comparación por token, no substring, así 100 NO se verifica con "100.000"; política: punto no verificado → eliminado con aviso, <2 puntos → rechazo total; nunca lanza, fallo → rechazo seguro); `ragClient.getPageTexts(page)` (solo memoria local); `ExcelChat` verifica antes de render en burbuja + historial con avisos honestos ("N de M datos no verificados…" / "Gráfica descartada…"); CSS `.chart-notice` discreto. Verificado: suite 12/12 (canon es/en/miles/negativos, reales aceptados, inventado descartado, rechazo total, anti-substring, %/moneda, null seguro, página ausente), `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34), sin backend (§11). Con esto las gráficas Fase C ya son fiables; Fase E puede apoyarse en el mismo verificador.

- **Fase 34 — Botón "Generar gráfica del documento", Fase E (2026-09-14):** análisis con texto completo SOLO bajo orden explícita del usuario. Excepción de privacidad autorizada (§41):
```
Current approach: el LLM solo recibe Top 3 fragmentos RAG (§8, fases 14/28).
Problem: con solo 3 fragmentos no hay visión comparativa global para graficar.
Proposed change: botón "Generar gráfica" en el panel → confirmación inline → envío del texto (tope 250 KB) a /api/chat mode:'chart-full' → chart-JSON verificado.
Why: orden directa del usuario + consentimiento explícito inline; sin esto la feature es imposible.
Trade-offs: el proveedor de IA procesa más texto bajo demanda (no se persiste nada); el default RAG Top 3 sigue intacto.
Impact on: [privacidad §8: excepción consentida y documentada | seguridad: mismos guards + topes | UX: confirm + cancelar + alcance visible]
```
  Cambios: `src/lib/chartFull.ts` (tope 250 KB, `selectChartFullPages` determinista por densidad numérica si excede + `formatPageRange`, nunca lanza); `api/chat/index.ts` modo `chart-full` (mismos guards origen/rate-limit; cuerpo hasta 300 KB solo en este modo — el resto re-valida 32 KB; valida páginas, tope 250 K chars/500 págs, prompt con alcance + regla de cifras literales, responde `{text, analyzedPages}`); `src/components/pdf/ChartFullButton.tsx` (idle→confirm→working→chat; consentimiento "Nada se guarda en servidores salvo el proveedor de IA" + alcance `págs. X de N`; `AbortController` + Detener; `key={docId}` en vez de efecto); `ExcelChat` escucha `copixi:chart-full-result` y añade mensajes normales (mismo pipeline split→verificar→SVG + historial); `ChatHistoryMsg.chartPages` persistido + `trimHistoryContent` que recorta prosa sin mutilar el fence; `verifyChartSpec` acepta `allowedPages` (fuera de rango cae aunque la cifra exista); línea "Analizado: págs. …" bajo cada gráfica full-doc; dropdown y scope con variante oscura. Verificado: suites 9/9 (selección+determinismo+tope+rango) y 3/3 (trim historial), `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34), sin backend nuevo (§11, mismo endpoint). Pendiente prueba manual en live (doc 10-20 págs <45 s, cancelar, doc gigante con aviso).

- **Fase 35 — Auditoría y cierre, Fase F (2026-09-14):** 100% del plan gráficas (A→F) a nivel código. Evidencia: suites puras 10/10 (`highlight`), 9/9 (`chartJson`), 9/9 (`chartFull`+`allowedPages`) y 3/3 (`trimHistoryContent`); **guards del backend 10/10 invocando el handler real** (`405/415/403/400×3/413×3` + rate-limit 429 a la 22ª; el tope 32 KB sigue vigente para modos no chart-full); Quality Gate re-verificado (0 Tailwind/shadcn/lucide, 0 `VITE_`, `GEMINI_API_KEY` solo server, 1 sola Function, sin deps nuevas en Fases 30-35); revisión estática (sin `dangerouslySetInnerHTML` en ruta chart — React escapa labels; `filename` recortado, `page` validado; split 1-col <900px; variantes oscuras de panel/chart/dropdown); `pnpm build` ok (principal ~146 KB + `ChartCard` lazy 3.32 KB, pdf/workers aparte), `pnpm lint` 6 warnings preexistentes; README actualizado (capacidades 5-6, 4 modos, excepción de privacidad). **Pendiente tras push+deploy:** E2E en live (pregunta con/sin números, JSON manipulado, doc 10-20 págs <45 s, cancelar en vuelo, doc gigante con aviso, mobile split, oscuro en ChartCard) — el trabajo está sin commitear, live aún no tiene Fases 30-35.

- **Fase 36 — Tests triple-agente (QA + seguridad + diseño) + fixes, post-F (2026-09-14):** 3 subagentes en paralelo contra live. QA: deploy al día (bundle md5-idéntico al local, CSP con fix Fase 27), guards live 405/400/413/403 ok, `chart-full` mínimo responde `{text, analyzedPages}` + chart-JSON válido en ~1.3 s; sin chromium en el sistema (E2E navegador pendiente). Diagnóstico de los 2 bugs del usuario: ambos encajan con **PDF escaneado sin texto** (sin fragmentos → respuesta genérica por diseño; pre-selección vacía → Enviar deshabilitado = atasco en la confirmación). Fixes: `ExcelChat` short-circuit local sin quemar cuota si `chunkCount===0` (mensaje accionable OCR); `ChartFullButton` muestra error honesto en vez de confirmación atascada si no hay texto. Seguridad (H1: `detail` del proveedor enmascarado en chat prod; H2: fuera wildcard `*.vercel.app`; M1: `x-real-ip` preferida; M3: stream sin content-length con contador acotado; M4: `object-src 'none'` + `img-src` recortado + `unsafe-eval`→`wasm-unsafe-eval`; B1: fuera ACAO inválido; M2/B2/B3 documentados) — re-verificado con suite 8/8 sobre el handler real. Diseño (D1: panel/visor/dropdown/top-bar a tokens cálidos en oscuro + body a surface-2; D3: theme-color por modo; D4: warning `#8a5a00` AA; D5: jerga→humano en 3 strings; D6: dropdown full-width en mobile; D7/D8: hover y foco con tokens; D2: og:image absoluta, PNG 1200×630 pendiente). Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34). Requiere push+deploy para verse en live.

- **Fase 37 — Rediseño "Mercado al Atardecer" Fases 1+2 (2026-09-14):** nueva paleta tropical-formal sobre fondo `#EDEDE9` (brief del usuario). Tokens `src/index.css`: papel `#EDEDE9`, superficie `#FFFFFF/#E2E2DB`, tinta `#191B18`, primario azul despacho `#1D3A5F` (+`--color-on-primary` para contraste en ambos modos), acento mango `#A85B12`, éxito selva `#1E6B45`, error jamaica `#9E2B47`, softs derivados con `color-mix` (auto-adaptan a oscuro); oscuro remapeado a fruta de noche. Fase 2: **cero hex fuera de tokens en `App.css`** (migrados ~60 valores: grises azulados, rojos/orajas viejos, sombras y anillos a mixes del acento, scrims a negro cálido; overrides oscuros redundantes eliminados; bloque de código a surface-2). Excepción documentada: `Mascota.css` conserva sus colores de personaje (7 unidades robot con identidad propia, no cromo UI). Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, sin nuevas deps (§34). Siguen Fases 3 (disciplina del 10% mango), 4 (tipografía/aire), 5 (iconos Pixelarticons §18) y 6 (QA visual).

- **Fase 38 — Disciplina del 10% mango, Fase 3 (2026-09-14):** auditoría de cada uso del acento: eliminados 6 decorativos (sombra de icono→primario, contenedor del switch→surface-2/borde, badge→surface-2, barra KPI→primario sólido, tarjeta de progreso→borde+sombra estándar, thead→surface-2, páginas de búsqueda→primario). **CTA principal a mango**: `.btn-primary` ahora `accent` + `--color-on-accent` (blanco 5.04 en claro, tinta 7.9 en oscuro). Mango restante solo donde actúa: drag-feedback, glow mascota, estados (thinking/pulse/active-tab), hovers con affordance, focos, resaltado de citas y tintas de código. Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes. Siguen Fases 4, 5 y 6.

- **Fase 39 — Tipografía y aire, Fase 4 (2026-09-14):** eliminado ~60 líneas de CSS muerto legacy (KPIs, FilterBar, chips, select, tooltip, insights — sin consumidores desde Fase 17); aire: gaps 20→24/28 en hero/stack/split/chat, más padding en hero; jerarquía con bordes en vez de sombras (`.card:hover` ahora solo cambia borde, sin lift); título del dropzone 17→20px. Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes, 0 referencias a las clases eliminadas. Siguen Fases 5 (iconos) y 6 (QA visual).

- **Fase 40 — Iconos, Fase 5 (2026-09-14):** disciplina de tamaños dentro de Pixelarticons (§18 intacto, sin librería nueva): 12/13→14 denso (citas, copiar, .md), 15→16 UI (detener, enviar); escala resultante 14/16/18/22 documentada en `Icon.tsx` (los tamaños 40/120/180 son del personaje mascota, no iconografía). Set de glifos ya era el formal correcto; `aria-hidden` por defecto verificado. Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes. Sigue Fase 6 (QA visual).

- **Fase 41 — QA visual, Fase 6 (2026-09-14):** cierre del rediseño. Contraste AA medido sobre tokens finales: **13/13 pass** (texto/muted/primario/selva/jamaica/warning/mango-btn en claro; texto/muted/primario/on-accent en oscuro; texto sobre surface y muted sobre surface-2). 390px: sin anchos fijos problemáticos (todo max-width fluido + split a 1 col <900px + dropdown full-width; glow del landing centrado cabe sin overflow). Oscuro: 0 hex fuera de tokens en `App.css`; `Mascota.css` (39 hex) excepción documentada de personaje. Reduced-motion: 3 bloques. Límite honesto: sin navegador en el entorno no hay capturas antes/después — verificación visual pendiente con `pnpm dev` o en live tras deploy. Verificado: `pnpm build` ok, `pnpm lint` 6 warnings preexistentes. Rediseño "Mercado al Atardecer" completo (Fases 37-41).

---

*Última actualización: 2026-09-14 (Fase 37 rediseño F1+F2 — tokens tropicales + 0 hex fuera de tokens; build ok) — Contrato vivo de Copixi. Cualquier desviación debe justificarse según §41.*
