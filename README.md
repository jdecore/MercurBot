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
3. Pregunta en lenguaje natural → respuesta en streaming con citas `[Pág. N]` clicables: abren el visor embebido en esa página. Al abrir, la IA te recibe con un briefing de 3 puntos clicables (generado una vez, sin bloquear). El shell tiene sidebar con estado del motor (`100% local` / `pensando…` / `híbrida ✦ modelo`, solo lectura), `+ Nuevo análisis`, `Cargar PDF`, Recientes (biblioteca OPFS), Capacidades y usuario local — drawer en mobile vía botón flotante
4. Copia la respuesta o descárgala en `.md`; biblioteca de recientes (OPFS) para re-abrir sin re-subir; buscar-en-documento por páginas; historial por documento; dictado por voz + lectura de respuestas (TTS); mascota con voz y cara personalizable (tarjeta modal: 19 diseños por semilla, ojos, accesorios y 7 unidades base)
5. Vista split chat | documento: las citas `[Pág. N]` abren la página en el panel lateral y **resaltan el fragmento fuente** (con aviso honesto si no se localiza)
6. Gráficas verificadas: si preguntas por comparaciones/evoluciones con cifras, la IA devuelve chart-JSON y la app lo dibuja en SVG propio — cada cifra se verifica contra el documento (lo no verificado se elimina con aviso; sin verificación no hay gráfica). Botón **Generar gráfica** en el panel para analizar el documento completo bajo tu orden (con consentimiento inline, alcance visible y cancelación)

---

## Arquitectura (técnica)

```
User → React → PDF extractor (pdfjs, páginas + chunks)
     → RAG local (MiniSearch + MiniLM en Web Worker, OPFS)
     → ExcelChat (cliente SSE propio) → /api/chat (Vercel Function mínima)
     → Gemini / OpenRouter → streaming con citas [Pág. N] verificables
```

Todo lo determinista (extracción, chunking, embeddings, fusión RRF) es local y puro.

### Browser Data Engine — `src/data/` (mínimo, solo PDF)
```
extractors/pdf.ts      extracción de páginas + chunks con metadato de página
universalParser.ts     validación solo-PDF (30 MB) + orquestación
types.ts               tipos compartidos (filtros/columnas para storage)
```
El motor tabular (profiler/statistics/transformations/anomalyDetection/chartAdapter/cleaner) se eliminó en la Fase 25 al quedar sin consumidores de UI.

### Capa de IA — chat propio + RAG local
- **Frontend:** `ExcelChat.tsx` — cliente de chat propio y ligero (fetch + SSE `text-delta` a `/api/chat`, sin SDK externo). Ante cada consulta corre el pipeline RAG e inyecta los fragmentos con página.
- **Backend único:** `api/chat.ts` — SDK oficial `@google/generative-ai` (Gemini) primario y fallbacks Groq → OpenRouter (ambos OpenAI-compatible, sin deps nuevas), 4 modos (chat SSE, `summary`, `extract`, `chart-full`), rate-limit 20/min, keys solo en server. Por defecto solo recibe 3 fragmentos; el texto completo (máx. 250 KB) viaja únicamente con `chart-full`, bajo orden explícita del usuario con consentimiento inline (Fase E).
- **Pipeline de búsqueda RAG (Fases 14 + 24):** `src/lib/ragPipeline.ts` (`runRagPipeline`): modo híbrido Top 15 vectorial + Top 15 MiniSearch → fusión RRF (k=60) → Top 3 (lógica en `src/workers/rag.worker.ts`; embeddings MiniLM `Xenova/all-MiniLM-L6-v2` en Web Worker con persistencia OPFS); fallback Top 3 MiniSearch directo (`ragClient.searchMainThread` + watchdog con conmutación). Desde la Fase 24 el `docId` es la huella estable del archivo (`src/lib/fileHash.ts`), así que los vectores se recuperan de OPFS sin recompute al reabrir. `api/chat.ts` topea a 3 fragmentos de ≤1200 chars con formato `[Fragmento i | Pág. N]` e instruye citar `[Pág. N]`; `ExcelChat.tsx` renderiza citas inline en el streaming + badges expandibles con snippet/matchType e indica el modo (híbrida vs. léxica).
- **Briefing + voz (Fase 24):** al indexar, `mode:'summary'` genera la tarjeta "Este documento en 3 puntos" (clicable al visor, degradado silencioso); el dock tiene dictado por voz (Web Speech API `es-ES`, sin deps, oculto sin soporte).

### Estado y UI
`src/state/DashboardContext.tsx` (fuente única mínima: `error`, `loading`, `pdfDoc`). Mascota única personalizable (robot por semilla con 19 diseños + 7 unidades base o Blobatar, tarjeta de personalización modal, TTS nativo), modo oscuro automático (`prefers-color-scheme`, solo tokens), Radix UI (a11y AA), Pixelarticons, CSS nativo con tokens `:root` (paleta "Gris + Maracuyá + Hoja", Fase 43: base gris neutra `#E7E7E3`, primario gris petróleo, acento amarillo maracuyá `#E3A008` solo donde actúa, apoyo verde hoja `#0E7C6B`).

---

## Stack

| Categoría | Tecnología |
|---|---|
| Framework / Lenguaje | React 19 · TypeScript · Vite · pnpm |
| Estilos / UI | Native CSS + tokens · Radix UI · Pixelarticons (SVG inline, sin webfont) |
| PDF / RAG | pdfjs-dist · MiniSearch · @xenova/transformers (MiniLM) |
| IA | Gemini / Groq / OpenRouter vía `api/chat.ts` · streaming SSE con citas |
| Avatar | Blobatar (`blobatar` + `@blobatar/react`, ~14 KB, MIT, cero dependencias) |
| Backend | Vercel Function única (`api/chat.ts`) |

---

## Corre en 3 comandos

```bash
pnpm install
pnpm dev      # http://localhost:5173 — sube un PDF y pregunta
pnpm build    # tsc -b + vite build
```

Requisitos: Node 20+, pnpm 11.22.0. `.env.example` trae `GEMINI_API_KEY=` (server-only, nunca `VITE_`). Sin key la lectura e indexado locales funcionan; el chat y el briefing necesitan key (cadena: Gemini → Groq si existe `GROQ_API_KEY` → OpenRouter si existe `OPENROUTER_API_KEY`).

**Deploy Vercel (2 min):** importa repo → Framework Vite → env `GEMINI_API_KEY` → `api/chat.ts` auto-detectada vía `vercel.json`.

---

## Seguridad y Privacidad

- *Your document stays in your browser.* Sin subida del PDF; la IA solo recibe 3 fragmentos con página (§8). Excepción consentida (Fase E): el botón **Generar gráfica** envía el texto (máx. 250 KB) al proveedor de IA tras confirmación inline — nada se persiste.
- Keys nunca en frontend ni logs. Rate-limit y validación de payload en la Function.
- Solo se aceptan PDFs (30 MB); otros formatos se rechazan con mensaje accionable.
- Errores que dirigen: PDF con contraseña, escaneado sin texto, límite de peticiones (429) y sin conexión explican causa + arreglo.

---

## Quality Gate (verificado)
`pnpm build` ok · sin Tailwind/shadcn/lucide · solo Pixelarticons · sin `VITE_` secrets · sin backend tradicional (solo proxy mínimo) · PDF 100% local · RAG híbrido + citas verificables · responsive + a11y AA · ErrorBoundary + empty states.

Fases 0–42 completadas (ver `AGENTS.md` §42/§43): split chat|documento, cita→resaltado, gráficas SVG verificadas, chart-full bajo demanda, hardening post-auditoría triple (QA+seguridad+diseño), rediseño "Mercado al Atardecer" (tokens tropicales, CTA mango, iconos 14/16/18/22, QA visual 13/13 AA) y tarjeta modal de personalización del robot.

---
*Construido con pnpm, CSS nativo, Radix, pdfjs y chat SSE propio. Sin atajos. Sin humo. Solo producto.*
