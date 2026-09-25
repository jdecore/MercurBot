# Plan: Agente Laya-router + herramientas + MCP/browser

## Estado actual

- `Laya` clasifica `literal | semantic` o, con `INTENT_SCHEMA`, 3 acciones (`rag | direct | chart`) + modo de búsqueda.
- `ExcelChat.runQuery()` **no ejecuta** `intentAction === 'chart'`; la gráfica solo se lanza desde el botón manual `ChartFullButton`.
- `api/chat/index.ts` es proxy puro a LLM: sin tool calls, sin MCP, sin browser automation.
- No existe registry de herramientas, ni runtime de agente, ni capa de ejecución de tools.

## Objetivo

Convertir a Mercur en un **agente con routing 100% Laya**:
1. Usuario pregunta → **Laya** decide qué acción ejecutar.
2. Acciones posibles: `rag`, `chart`, `direct`, `web_search`, `mcp`, `agent`.
3. El **LLM solo genera texto**, nunca decide acciones ni ejecuta tools directamente.
4. UI refleja cada paso: “Buscando en el documento…”, “Generando gráfica…”, “Consultando web…”, etc.

## Arquitectura: Laya como router central

```
Usuario pregunta
  ↓
Laya routeIntent(query, INTENT_SCHEMA)
  → action: 'rag' | 'chart' | 'direct' | 'web_search' | 'mcp' | 'agent'
  → searchMode: 'literal' | 'semantic'
  ↓
Agent Runtime ejecuta la acción:
  - 'rag'      → runRagPipeline() → texto LLM
  - 'chart'    → selectChartFullPages() → chart-full server → gráfica
  - 'direct'   → LLM sin contexto documento
  - 'web_search' → server tool: web_search → texto LLM
  - 'mcp'      → server tool: mcp_tool → texto LLM
  - 'agent'    → tool-calling iterativo (Laya decide siguiente tool en cada paso)
```

**Principio clave:** Laya decide TODO el routing. El LLM solo genera texto final.

## 1. Extender Laya a multi-class router

**Archivo:** `src/entities/robot/intentSchema.ts`

Nuevo `INTENT_SCHEMA`:

```ts
export interface IntentQuestion {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export interface IntentSchema extends Record<string, IntentQuestion> {
  action: IntentQuestion
  searchMode: IntentQuestion
}

export const INTENT_SCHEMA: IntentSchema = {
  action: {
    type: 'choice',
    instructions: 'What action should the robot take for this user message?',
    criteria: {
      rag: 'Search the document for relevant information (the user is asking about the uploaded PDF)',
      direct: 'Answer directly without searching the document (greetings, thanks, small talk, general knowledge)',
      chart: 'Generate a chart or visualization from comparable figures in the document',
      web_search: 'Search the web for current/recent information the document does not contain (news, prices, live data, external facts)',
      mcp: 'Use an available MCP tool (database query, calculation, API call, etc.)',
      agent: 'This requires multiple steps or tool use to answer properly (complex analysis, multi-source reasoning)',
    },
  },
  searchMode: {
    type: 'choice',
    instructions: 'If searching the document, what kind of search is needed?',
    criteria: {
      literal: 'Exact words, numbers, page references, dates, article numbers',
      semantic: 'Meaning, concepts, paraphrases, summaries, analysis',
    },
  },
}
```

`parseIntentResult` debe retornar `ActionChoice` extendido: `'rag' | 'direct' | 'chart' | 'web_search' | 'mcp' | 'agent'`.

## 2. Tool registry + runtime

**Archivo nuevo:** `src/shared/lib/tools.ts`

```ts
export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (params: Record<string, unknown>) => Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  display?: string
}
```

Tools base:

| Tool | Ejecución | Descripción |
|------|-----------|-------------|
| `rag_search` | Frontend | Busca en el documento indexado (`runRagPipeline`) |
| `chart_full` | Frontend + Server | Genera gráfica del documento completo |
| `web_search` | Server (Vercel Function) | Busca en web (simulada o via API) |
| `mcp_tool` | Server (Vercel Function) | Proxy a servidores MCP configurados |
| `calculate` | Frontend | Evalúa expresiones matemáticas simples |

Registry:

```ts
const registry = new Map<string, Tool>()
export function registerTool(tool: Tool) { registry.set(tool.name, tool) }
export function getTool(name: string) { return registry.get(name) }
export function listTools() { return Array.from(registry.values()) }
```

## 3. Agent Runtime (orquestador Laya-driven)

**Archivo nuevo:** `src/shared/lib/agentRuntime.ts`

```ts
export interface AgentStep {
  tool: string
  params: Record<string, unknown>
  result?: ToolResult
  display?: string
}

export interface AgentResult {
  steps: AgentStep[]
  finalText: string
  displayChain: string[]
}
```

`executeAgent(query, context)`:
1. Llama a `routeIntent(query, INTENT_SCHEMA)` para obtener `action`.
2. Si es `rag`/`chart`/`direct`: ejecuta pipeline directo (sin tool-calling iterativo).
3. Si es `web_search`/`mcp`: ejecuta tool individual en server, luego LLM genera texto.
4. Si es `agent`: tool-calling iterativo controlado por Laya en cada paso (no por LLM).

**Flujo `agent` mode:**
```
Laya decide: 'agent'
  ↓
Agent Runtime ejecuta tool 1 (Laya elige cuál)
  ↓
Tool result → Agent Runtime decide siguiente tool o finalizar
  ↓
Repetir hasta 3 tools max o Laya decide 'done'
  ↓
LLM genera texto final con todos los resultados
```

## 4. Extender Vercel Function

**Archivo:** `api/chat/index.ts`

Nuevo modo: `mode === 'agent'`

Request:
```ts
{
  mode: 'agent',
  messages: Array<{role, content}>,
  context?: object,
  lang?: 'es' | 'en',
  step?: number,  // paso actual del agent loop
  toolResults?: Array<{tool, params, result}>
}
```

Response (SSE):
- `tool-call`: `{tool, params, display}` — Laya/Agent Runtime decide la tool
- `tool-result`: `{tool, result, display}` — Server ejecuta y devuelve
- `text-delta`: texto del LLM
- `finish`: `{steps, finalText}`

Server-side tools:
- `web_search`: prompt al LLM para generar query de búsqueda, luego summarize resultados (sin API externa en P0)
- `mcp_tool`: proxy HTTP a `MCP_SERVERS` configurados por env

**Constraint:** Solo 1 Vercel Function. El modo `agent` se agrega al handler existente.

## 5. UI: tool execution chain

**ExcelChat.tsx** — cambios:

Nuevo estado:
```ts
const [agentDisplay, setAgentDisplay] = useState<string>('')
```

Eventos SSE nuevos en el stream reader:
- `tool-call`: `setAgentDisplay(event.display || event.tool)`
- `tool-result`: `setAgentDisplay(event.display || 'Done')`
- `text-delta`: streaming normal

Robot subtitle:
- Durante tool execution: `copixi:robot-message` con el paso actual
- Al final: mensaje final + TTS

## 6. Flujos end-to-end

### Flujo 1: Pregunta sobre PDF
```
Usuario: "¿Qué dice el documento sobre los precios?"
  ↓
Laya: action='rag', searchMode='semantic'
  ↓
runRagPipeline(query, 3, 'semantic')
  ↓
LLM genera respuesta con citas
  ↓
Robot: "Encontré información en las páginas 5 y 8..."
```

### Flujo 2: Generar gráfica automáticamente
```
Usuario: "Compara las ventas por trimestre"
  ↓
Laya: action='chart'
  ↓
selectChartFullPages() → chart-full server → gráfica
  ↓
Robot: "Las ventas muestran tendencia creciente..."
```

### Flujo 3: Búsqueda web
```
Usuario: "¿Cuál es el precio del oro hoy?"
  ↓
Laya: action='web_search'
  ↓
Server: web_search tool → resultados
  ↓
LLM genera respuesta con fuente
  ↓
Robot: "Según datos recientes, el oro está a $2,050/oz..."
```

### Flujo 4: MCP tool
```
Usuario: "¿Cuánto es 15% de 2,500?"
  ↓
Laya: action='mcp' (calculate tool)
  ↓
Server: mcp_tool('calculate', {expr: '0.15 * 2500'})
  ↓
LLM genera respuesta
  ↓
Robot: "El 15% de 2,500 es 375."
```

### Flujo 5: Agent complejo
```
Usuario: "Analiza las ventas y genera un informe completo"
  ↓
Laya: action='agent'
  ↓
Agent Runtime: tool 1 = rag_search("ventas")
  ↓
Agent Runtime: tool 2 = chart_full(pages con ventas)
  ↓
Agent Runtime: Laya decide 'done'
  ↓
LLM genera informe completo con gráfica
  ↓
Robot: "El documento muestra crecimiento del 15%..."
```

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/entities/robot/intentSchema.ts` | Extender `INTENT_SCHEMA` con `web_search`, `mcp`, `agent` |
| `src/shared/lib/laya.ts` | Soportar `routeIntent` con schema extendido |
| `src/shared/lib/tools.ts` | **Nuevo.** Tool registry + tools base |
| `src/shared/lib/agentRuntime.ts` | **Nuevo.** Orchestrator Laya-driven |
| `src/widgets/excel/ExcelChat.tsx` | Consumir `agentRuntime`; renderizar tool chain |
| `src/app/App.tsx` | Listener para tool execution events |
| `api/chat/index.ts` | Modo `agent` con SSE events |
| `src/shared/lib/chartFull.ts` | Exponer para tool executor |
| `src/shared/lib/ragClient.ts` | Exponer para tool executor |
| `.env` / `vercel.json` | `MCP_SERVERS` config; CSP |

## Decisiones clave

| Decisión | Razón |
|----------|-------|
| Laya decide TODAS las acciones | LLM es solo para texto; Laya es rápido, local, gratuito |
| Tool registry en frontend + server | Frontend tools para RAG/chart; server tools para web/MCP |
| Agent loop max 3 tools | Prevenir bucles infinitos; latencia aceptable |
| Tool results en contexto LLM | LLM recibe resultados y genera texto final |
| MCP como extensión futura | Empezar con web_search; MCP requiere servidores externos |

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Laya con 6 clases puede ser menos preciso | Heuristic fallback robusto; empezar con 3 clases y expandir |
| Tool-calling iterativo sin LLM nativo | Agent Runtime simula tool-calling con pasos discretos |
| web_search sin API externa | Usar LLM para generar query + summarize resultados de búsqueda simulada |
| MCP servers necesitan hosting | Empezar sin MCP; agregar cuando haya servidores disponibles |

## Validación

- `pnpm build` verde.
- Flujo manual:
  1. Pregunta PDF → Laya `rag` → RAG funciona
  2. "Genera gráfica" → Laya `chart` → chart-full automático
  3. "Precio del dólar" → Laya `web_search` → server ejecuta → respuesta
  4. "Analiza ventas" → Laya `agent` → tool loop → informe completo

## Pregunta pendiente

**¿Cómo debe funcionar `web_search` sin API externa?**

- **Opción A:** Usar el mismo LLM para generar una query de búsqueda, luego "simular" resultados con conocimiento del modelo (no es búsqueda real, pero funciona offline)
- **Opción B:** Integrar una API de búsqueda gratuita (DuckDuckGo, Brave) con CORS proxy en Vercel
- **Opción C:** Dejar `web_search` como placeholder que muestra "Búsqueda web no disponible en este entorno"

Recomiendo **Opción B** para tener búsqueda real, con fallback a **Opción A** si la API falla.
