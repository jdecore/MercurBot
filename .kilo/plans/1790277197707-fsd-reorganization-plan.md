# Plan: Reorganización a Feature-Sliced Design + estructura de conocimiento para agentes

## Objetivo

Reorganizar el proyecto a una arquitectura mantenible a largo plazo y agregar la estructura de conocimiento para agentes (`designed.md`, skills, memory, context), sin romper build, lint ni behaviour.

## Metodología adoptada

**Feature-Sliced Design (FSD)** para el código frontend.
**Agent Knowledge Layer** para la documentación operativa del proyecto.

---

## 1. Estructura objetivo de `src/`

```
src/
├── app/                          # Init, providers, layout global, routing
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── providers.tsx             # DashboardProvider, LocaleProvider, etc.
├── pages/                        # Vistas/pantallas completas
│   └── MainPage.tsx              # Orquesta features, listeners globales
├── widgets/                      # Bloques compuestos de UI reutilizables
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── EngineStatus.tsx
│   ├── pdf/
│   │   ├── PdfViewer.tsx
│   │   └── ChartFullButton.tsx
│   ├── excel/
│   │   └── ExcelChat.tsx
│   ├── dashboard/
│   │   └── PdfProcessingCard.tsx
│   ├── onboarding/
│   │   └── OnboardingTour.tsx
│   └── charts/
│       └── ChartCard.tsx
├── features/                     # Funcionalidades autocontenidas
│   ├── pdf-upload/
│   │   └── BlackHoleUpload.tsx
│   ├── chat/
│   │   └── ExcelChatWrapper.tsx  # Si se decide separar del widget
│   ├── voice/
│   │   └── VoiceSession.tsx      # Hook/componente autocontenido
│   └── rag/
│       └── RagPipeline.tsx       # Orquestación de indexación/búsqueda
├── entities/                     # Modelos de dominio del negocio
│   ├── pdf/
│   │   ├── types.ts              # PdfChunk, PdfDocument, etc.
│   │   └── extractors/
│   │       └── pdf.ts
│   ├── robot/
│   │   ├── types.ts              # RobotConfig, MascotaMood, RobotUnitId
│   │   └── robotSeed.ts
│   └── rag/
│       └── types.ts              # RagSearchResultItem, QueryClass, etc.
├── shared/                       # Código reutilizable genérico
│   ├── ui/                       # Componentes visuales puros
│   │   ├── Icon.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Mascota.tsx
│   │   ├── MascotCustomizer.tsx
│   │   └── MascotaSvg.css
│   ├── lib/                      # Utilidades, workers, parsers, API clients
│   │   ├── chartFull.ts
│   │   ├── chartJson.ts
│   │   ├── debug.ts
│   │   ├── dictation.ts
│   │   ├── docLibrary.ts
│   │   ├── fileHash.ts
│   │   ├── highlight.ts
│   │   ├── idb.ts
│   │   ├── laya.ts
│   │   ├── locale.tsx
│   │   ├── preload.ts
│   │   ├── ragClient.ts
│   │   ├── ragPipeline.ts
│   │   ├── sounds.ts
│   │   ├── storage.ts
│   │   ├── tts.ts
│   │   ├── verifyChart.ts
│   │   ├── voiceSession.ts
│   │   └── workers/
│   │       └── rag.worker.ts
│   └── styles/                   # Tokens, global CSS
│       ├── tokens.css
│       └── global.css
├── types/                        # Tipos globales del proyecto
│   └── mascota.ts
├── index.css                     # (se moverá a shared/styles/)
├── App.css                       # (se moverá a app/)
└── main.tsx                      # Entry point
```

---

## 2. Reglas de importación FSD

Un slice solo puede importar de slices a la **misma altura o más internos**:

- `app` → puede importar de `pages`, `widgets`, `features`, `entities`, `shared`
- `pages` → puede importar de `widgets`, `features`, `entities`, `shared`
- `widgets` → puede importar de `features`, `entities`, `shared`
- `features` → puede importar de `entities`, `shared`
- `entities` → puede importar de `shared`
- `shared` → no importa de nadie

---

## 3. Estructura de conocimiento para agentes

```
.agents/
├── skills/                       # Skills específicas del proyecto
│   ├── rag.md
│   ├── voice.md
│   ├── embeddings.md
│   ├── laya.md
│   ├── deployment.md
│   └── debug.md
├── memory/                       # Bitácora temporal y aprendizajes
│   └── memory.md
└── context/                      # Documentos estables que rara vez cambian
    ├── designed.md               # Decisiones de diseño inmutables
    ├── stack.md                  # Stack elegido y por qué
    ├── constraints.md            # Restricciones hard
    └── glossary.md               # Terminología del dominio
```

**Uso:**
- `context/`: decisiones que no se discuten más. Si un agente nuevo pregunta por qué no hay Tailwind, va a `constraints.md`.
- `skills/`: instrucciones reutilizables por dominio. Si un agente va a tocar RAG, lee `rag.md`.
- `memory/`: lo que ya existía como `memory.md`, pero separado del contexto estable.

---

## 4. Mapa de migración de archivos

### 4.1 Crear nuevas carpetas

```bash
mkdir -p src/{app,pages,widgets/{layout,pdf,excel,dashboard,onboarding,charts},features/{pdf-upload,chat,voice,rag},entities/{pdf/{extractors},robot,rag},shared/{ui,lib/{workers},styles}}
mkdir -p .agents/{skills,memory,context}
```

### 4.2 Mover archivos

**src/app/**
- `src/App.tsx` → `src/app/MainPage.tsx` (o mantener como página principal)
- `src/App.css` → `src/app/App.css`
- `src/index.css` → `src/shared/styles/global.css`

**src/widgets/layout/**
- `src/components/layout/Sidebar.tsx` → `src/widgets/layout/Sidebar.tsx`
- `src/components/layout/EngineStatus.tsx` → `src/widgets/layout/EngineStatus.tsx`

**src/widgets/pdf/**
- `src/components/pdf/PdfViewer.tsx` → `src/widgets/pdf/PdfViewer.tsx`
- `src/components/pdf/ChartFullButton.tsx` → `src/widgets/pdf/ChartFullButton.tsx`

**src/widgets/excel/**
- `src/components/excel/ExcelChat.tsx` → `src/widgets/excel/ExcelChat.tsx`

**src/widgets/dashboard/**
- `src/components/dashboard/PdfProcessingCard.tsx` → `src/widgets/dashboard/PdfProcessingCard.tsx`

**src/widgets/onboarding/**
- `src/components/onboarding/OnboardingTour.tsx` → `src/widgets/onboarding/OnboardingTour.tsx`

**src/widgets/charts/**
- `src/components/charts/ChartCard.tsx` → `src/widgets/charts/ChartCard.tsx`

**src/features/pdf-upload/**
- `src/components/ui/BlackHoleUpload.tsx` → `src/features/pdf-upload/BlackHoleUpload.tsx`

**src/shared/ui/**
- `src/components/ui/Icon.tsx` → `src/shared/ui/Icon.tsx`
- `src/components/ui/ErrorBoundary.tsx` → `src/shared/ui/ErrorBoundary.tsx`
- `src/components/ui/Mascota.tsx` → `src/shared/ui/Mascota.tsx`
- `src/components/ui/MascotCustomizer.tsx` → `src/shared/ui/MascotCustomizer.tsx`
- `src/components/ui/MascotaSvg.css` → `src/shared/ui/MascotaSvg.css`

**src/entities/pdf/**
- `src/data/types.ts` → `src/entities/pdf/types.ts`
- `src/data/extractors/pdf.ts` → `src/entities/pdf/extractors/pdf.ts`

**src/entities/robot/**
- `src/types/mascota.ts` → `src/entities/robot/types.ts`
- `src/lib/robotSeed.ts` → `src/entities/robot/robotSeed.ts`

**src/entities/rag/**
- `src/workers/rag.worker.ts` → `src/entities/rag/worker.ts` o mantener en `src/shared/lib/workers/`
- Tipos de RAG desde `src/workers/rag.worker.ts` y `src/lib/ragClient.ts`

**src/shared/lib/**
- Todo `src/lib/*.ts` y `src/lib/*.tsx`
- `src/lib/workers/rag.worker.ts` (si no se movió a entities)
- `src/state/DashboardContext.tsx` → `src/shared/lib/DashboardContext.tsx`

**src/shared/styles/**
- `src/index.css` → `src/shared/styles/global.css`
- Tokens CSS existentes

### 4.3 Archivos que se quedan en raíz de src/

- `src/main.tsx` → entry point, se actualiza import de App
- `src/vite-env.d.ts` (si existe) → se queda

---

## 5. Actualizaciones de importación

**Orden recomendado de actualización:**

1. Mover archivos con `git mv` para preservar historial.
2. Actualizar imports en archivos hoja primero:
   - Componentes UI
   - Workers
   - Utilidades
3. Actualizar imports en archivos intermedios:
   - Widgets
   - Features
   - Entities
4. Actualizar imports en `App.tsx` y `main.tsx`.
5. Actualizar `tsconfig.json` si es necesario (paths, include).
6. Actualizar `vite.config.ts` si hay alias.

---

## 6. Creación de `.agents/`

### 6.1 `designed.md`

```markdown
# Designed.md — Decisiones inmutables del proyecto

## Arquitectura
- Frontend-first, sin backend tradicional
- Solo 1 Vercel Function proxy (`api/chat/index.ts`)
- Datos se quedan en el browser; el LLM recibe solo contexto agregado

## Stack
- React + TypeScript + Vite
- CSS nativo (sin Tailwind/UnoCSS/Windi)
- Radix UI + CSS propio (sin shadcn/ui)
- Pixelarticons (sin lucide/Heroicons/FA)
- pdfjs-dist para PDFs
- @huggingface/transformers para embeddings
- onnxruntime-web para ONNX WASM
- @google/genai para Gemini

## Reglas hard
- Sin VITE_ secrets en frontend
- Sin dependencias nuevas sin justificar
- Solo pnpm
- Solo 1 Vercel Function
- CSP estricta en vercel.json
- Permissions-Policy hardened
```

### 6.2 `stack.md`

```markdown
# Stack.md — Stack tecnológico y por qué

## Frontend
- React 19: última estable, Concurrent Features
- TypeScript 7: rewrite nativo Rust, 10x más rápido
- Vite 8: build rápido, rolldown por defecto
- Radix UI: primitivas accesibles sin estilos
- Pixelarticons: iconos consistentes con el diseño

## AI/ML
- @huggingface/transformers: embeddings en WASM
- onnxruntime-web: inferencia ONNX en browser
- @google/genai: Gemini API oficial
- Groq + OpenRouter: fallbacks

## Deploy
- Vercel: Functions + Edge Network
- OPFS: persistencia local de modelos y vectores
```

### 6.3 `constraints.md`

```markdown
# Constraints.md — Restricciones hard del proyecto

## No negociable
1. Sin Tailwind/UnoCSS/Windi
2. Sin shadcn/ui
3. Sin lucide/Heroicons/FA
4. Sin backend tradicional
5. Sin VITE_ secrets en frontend
6. Solo pnpm
7. Sin dependencias nuevas sin justificar

## Performance
- Build < 5s
- JS initial < 250KB
- Modelos se descargan en background
- Heuristic fallback siempre disponible

## Privacidad
- PDF nunca sale del browser
- Solo Top 3 fragmentos RAG al LLM
- "Generar gráfica" requiere consentimiento explícito
```

### 6.4 `glossary.md`

```markdown
# Glossary.md — Terminología del dominio

## Términos
- **MercurBot**: nombre del producto
- **Copi/Mercur**: nombre del robot
- **RAG**: Retrieval-Augmented Generation
- **Laya**: clasificador ONNX literal vs semántico
- **Prewarm**: descarga de modelos en background al startup
- **Engine status**: estado del motor de búsqueda (hybrid/lexical)
- **OPFS**: Origin Private File System
- **SAB**: SharedArrayBuffer
- **COEP**: Cross-Origin-Embedder-Policy
- **COOP**: Cross-Origin-Opener-Policy
```

---

## 7. Skills iniciales

```
.agents/skills/
├── rag.md           # Cómo funciona el pipeline RAG, workers, embeddings
├── voice.md         # VoiceSession hook, barge-in, volume meter
├── embeddings.md    # Modelo embeddings, descarga, OPFS cache
├── laya.md          # Clasificador ONNX, heuristic fallback
├── deployment.md    # Vercel deploy, CSP, COEP, permissions
└── debug.md         # Debugger oculto, __merucbot.check(), Ctrl+Shift+D
```

Cada skill debe incluir:
- Propósito
- Archivos clave
- Cómo probarlo
- Errores comunes y soluciones

---

## 8. Migración de `memory.md`

Mover `memory.md` a `.agents/memory/memory.md` y actualizar referencias en `AGENTS.md`.

---

## 9. Actualizaciones de configuración

### 9.1 `tsconfig.json`

Verificar que `include` cubra la nueva estructura:
```json
{
  "include": ["src/**/*.ts", "src/**/*.tsx", "api/**/*.ts"]
}
```

### 9.2 `vite.config.ts`

Verificar que `manualChunks` siga funcionando con las nuevas rutas. Si se usan alias, actualizarlos.

### 9.3 `vercel.json`

Sin cambios; headers permanecen iguales.

---

## 10. Orden de ejecución

1. **Commitear estado actual** como punto de rollback.
2. **Crear estructura de carpetas** (`.agents/`, `src/app`, etc.).
3. **Mover archivos** con `git mv` para preservar historial.
4. **Actualizar imports** en lotes:
   - Lote 1: shared/ui, shared/lib, entities
   - Lote 2: widgets, features
   - Lote 3: app, pages, main.tsx
5. **Crear `.agents/context/`** con `designed.md`, `stack.md`, `constraints.md`, `glossary.md`.
6. **Crear `.agents/skills/`** con skills iniciales.
7. **Mover `memory.md`** a `.agents/memory/memory.md`.
8. **Actualizar `AGENTS.md`** con nuevas rutas de referencia.
9. **Verificar build**: `pnpm build`.
10. **Verificar lint**: `pnpm lint`.
11. **Verificar que no haya referencias rotas**: grep de imports antiguos.

---

## 11. Riesgos

1. **Imports rotos**: mitigado por ejecutar en lotes pequeños y verificar build después de cada lote.
2. **Historial de git perdido**: mitigado por usar `git mv` en lugar de copiar/borrar.
3. **Breaking changes en runtime**: mitigado por verificar `pnpm build` y `pnpm dev` después de cada lote.
4. **CSP/COEP rotos**: no se tocan en esta reorganización; permanecen en `vercel.json`.

---

## 12. Validación final

- [ ] `pnpm build` pasa sin errores
- [ ] `pnpm lint` pasa sin errores nuevos
- [ ] `pnpm dev` funciona y la app se ve igual
- [ ] No hay referencias a rutas antiguas de `src/components/`, `src/lib/`, etc.
- [ ] `.agents/` estructura creada con documentos base
- [ ] `memory.md` movido a `.agents/memory/`
- [ ] `AGENTS.md` actualizado con nuevas rutas

---

## 13. Pregunta al usuario

**¿Querés que esta reorganización se haga en un solo commit grande o en commits más chicos por lote?**

Recomendación: **commits por lote** (uno por carpeta/grupo de archivos) para facilitar rollback y revisión. Por ejemplo:
- Commit 1: crear estructura base + mover shared/ui + shared/lib
- Commit 2: mover entities + widgets
- Commit 3: mover features + app
- Commit 4: crear .agents/ + migrar memory.md + actualizar AGENTS.md
