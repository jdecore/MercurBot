# Copixi — Tu Analista de Documentos PDF con IA

**Sube un PDF → se vectoriza en tu navegador en segundos → pregunta lo que quieras y responde con citas verificables `[Pág. N]`.**

> AI-native PDF analyst, frontend-first. Sin servidores propios, sin subir documentos sensibles, costo de IA mínimo.

---

## Por qué Copixi ayuda a tu empresa

Copixi convierte los PDFs que tu equipo ya tiene (manuales, guías, reportes, contratos) en respuestas verificables, **sin subir el documento a ningún servidor**.

| Lo que entrega | Valor de negocio |
|---|---|
| **Frontend-first** — extracción e indexado corren en el navegador | **0$ de infraestructura.** Despliegas en Vercel en 2 minutos, sin servidores ni DB. |
| **Privacidad por diseño** — el PDF nunca sale del navegador; la IA solo recibe 3 fragmentos | Cumple con clientes sensibles a datos. Sin riesgo de fuga ni compliance caro. |
| **RAG local híbrido** — Top 15 vectorial + Top 15 léxico → RRF → Top 3, todo en el dispositivo | Costo de IA marginal. Free tier viable en producción. |
| **Citas verificables** — cada dato responde con `[Pág. N]` expandible al fragmento fuente | Confianza: nada de alucinaciones, todo trazable a la página. |
| **Conversión inmediata** — sin registro, sube un PDF y pregunta | Tus usuarios llegan al "wow" sin fricción ni onboarding. |
| **Mascota personalizable** — 7 unidades de robot o avatar Blobatar con tu nombre | Producto memorable sin costo de diseño. |

**Resultado:** responder preguntas sobre un documento de 50 páginas toma segundos, en cualquier navegador, con costo casi nulo.

---

## Qué es

Un **analista de documentos con IA**: subes un PDF y conversas con él, con cada respuesta anclada a su página.

1. Carga un PDF (drag & drop, 30 MB) — solo PDF, sin otros formatos
2. Extracción de páginas + indexado local (MiniSearch inmediato, vectores MiniLM en Web Worker con OPFS)
3. Pregunta en lenguaje natural → respuesta en streaming con citas `[Pág. N]` clicables: abren el visor embebido en esa página. Al abrir, la IA te recibe con un briefing de 3 puntos clicables (generado una vez, sin bloquear)
4. Copia la respuesta o descárgala en `.md`; biblioteca de recientes (OPFS) para re-abrir sin re-subir; buscar-en-documento por páginas; historial por documento + follow-ups dinámicos; mascota con voz y cara personalizable (colapsable con ⚙)

---

## Arquitectura (técnica)

```
User → React → PDF extractor (pdfjs, páginas + chunks)
     → RAG local (MiniSearch + MiniLM en Web Worker, OPFS)
     → ExcelChat (cliente SSE propio) → /api/chat (Vercel Function mínima)
     → Gemini / OpenRouter → streaming con citas [Pág. N] verificables
```

Todo lo determinista (extracción, chunking, embeddings, fusión RRF) es local y puro.

### Browser Data Engine — `src/data/` (funciones heredadas)
```
extractors/pdf.ts      extracción de páginas + chunks con metadato de página
universalParser.ts     validación solo-PDF (30 MB) + orquestación
profiler.ts / statistics.ts / transformations.ts / anomalyDetection.ts / chartAdapter.ts
                       motor tabular conservado como engine puro (sin UI activa en PDF-only)
```

### Capa de IA — chat propio + RAG local
- **Frontend:** `ExcelChat.tsx` — cliente de chat propio y ligero (fetch + SSE `text-delta` a `/api/chat`, sin SDK externo). Ante cada consulta corre el pipeline RAG e inyecta los fragmentos con página.
- **Backend único:** `api/chat.ts` — SDK oficial `@google/generative-ai` (Gemini) primario y fallback OpenRouter, 3 modos (chat SSE, `summary`, `extract`), rate-limit 20/min, `GEMINI_API_KEY` solo en server. Nunca recibe el documento, solo 3 fragmentos.
- **Pipeline de búsqueda RAG (Fase 14):** `src/lib/ragPipeline.ts` (`runRagPipeline`): modo híbrido Top 15 vectorial + Top 15 MiniSearch → fusión RRF (k=60) → Top 3 (lógica en `src/workers/rag.worker.ts`; embeddings MiniLM `Xenova/all-MiniLM-L6-v2` en Web Worker con persistencia OPFS); fallback Top 3 MiniSearch directo (`ragClient.searchMainThread` + watchdog con conmutación). `api/chat.ts` topea a 3 fragmentos de ≤1200 chars con formato `[Fragmento i | Pág. N]` e instruye citar `[Pág. N]`; `ExcelChat.tsx` renderiza citas inline en el streaming + badges expandibles con snippet/matchType e indica el modo (híbrida vs. léxica).

### Estado y UI
`src/state/DashboardContext.tsx` (fuente única: `pdfDoc`, filtros, resumen). Mascota única personalizable (260px, 7 unidades o Blobatar, TTS nativo, panel colapsable), modo oscuro automático (`prefers-color-scheme`, solo tokens), Radix UI (a11y AA), Pixelarticons, CSS nativo con tokens `:root` (paleta naranja/negro/blanco).

---

## Stack

| Categoría | Tecnología |
|---|---|
| Framework / Lenguaje | React 19 · TypeScript · Vite · pnpm |
| Estilos / UI | Native CSS + tokens · Radix UI · Pixelarticons |
| PDF / RAG | pdfjs-dist · MiniSearch · @xenova/transformers (MiniLM) |
| IA | Gemini / OpenRouter vía `api/chat.ts` · streaming SSE con citas |
| Avatar | Blobatar (`blobatar` + `@blobatar/react`, ~14 KB, MIT, cero dependencias) |
| Backend | Vercel Function única (`api/chat.ts`) |

---

## Corre en 3 comandos

```bash
pnpm install
pnpm dev      # http://localhost:5173 — sube un PDF y pregunta
pnpm build    # tsc -b + vite build
```

Requisitos: Node 20+, pnpm 11.22.0. `.env.example` trae `GEMINI_API_KEY=` (server-only, nunca `VITE_`). Sin key el dashboard funciona; la IA hace fallback a OpenRouter si existe `OPENROUTER_API_KEY`.

**Deploy Vercel (2 min):** importa repo → Framework Vite → env `GEMINI_API_KEY` → `api/chat.ts` auto-detectada vía `vercel.json`.

---

## Seguridad y Privacidad

- *Your document stays in your browser.* Sin subida del PDF; la IA solo recibe 3 fragmentos con página (§8).
- Keys nunca en frontend ni logs. Rate-limit y validación de payload en la Function.
- Solo se aceptan PDFs (30 MB); otros formatos se rechazan con mensaje accionable.
- Errores que dirigen: PDF con contraseña, escaneado sin texto, límite de peticiones (429) y sin conexión explican causa + arreglo.

---

## Quality Gate (verificado)
`pnpm build` ok · sin Tailwind/shadcn/lucide · solo Pixelarticons · sin `VITE_` secrets · sin backend tradicional (solo proxy mínimo) · PDF 100% local · RAG híbrido + citas verificables · responsive + a11y AA · ErrorBoundary + empty states.

Fases 0–20 completadas (ver `AGENTS.md` §42/§43).

---
*Construido con pnpm, CSS nativo, Radix, pdfjs y chat SSE propio. Sin atajos. Sin humo. Solo producto.*
