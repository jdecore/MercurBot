# memory.md — Diario de Agente

> **Última actualización:** 2026-09-23 | Rama: `main`

---

## Estado actual (live)

El deploy en `https://copixi.vercel.app/` tiene hasta **Fase 44** (sidebar estilo Copilot + modelos elegidos por el usuario). Los cambios de la sesión del 20/09 (rename a MercurBot/Mercur, SVG robot, ojos, brazos, TTS, sonidos, animaciones) están **sin commitear**. Nuevos cambios de 23/09: landing bilingüe Makers Fellowship + hardcoded audit.

---

## Qué hay sin commitear (16 archivos)

Branding: `Copixi→MercurBot`, robot `Copi→Mercur` (no confundir con "Hera" — era un nombre temporal descartado).

Archivos modificados:
```
AGENTS.md, README.md, api/chat/index.ts, index.html, .env.example
src/App.css, src/App.tsx, src/lib/locale.tsx, src/lib/storage.ts
src/components/excel/ExcelChat.tsx, src/components/layout/Sidebar.tsx
src/components/layout/EngineStatus.tsx, src/components/ui/ErrorBoundary.tsx
src/components/ui/MascotaCustomizer.tsx, src/components/pdf/BriefingCard.tsx
src/components/pdf/PdfViewer.tsx, src/components/pdf/ChartFullButton.tsx
src/components/onboarding/OnboardingTour.tsx
src/components/dashboard/PdfProcessingCard.tsx
```

---

## Qué se hizo en la última sesión

### Product i18n Migration (Phase 2) — 23/09

**Objetivo:** Migrar todos los strings del producto (UI) al diccionario bilingüe ES/EN.

**Archivos modificados:**
- `src/lib/locale.tsx` — Diccionario ampliado: ~352 strings × 2 idiomas. Agregados: chat UI, errores, botones, status, sugerencias, dictado, TTS, PDF viewer, chart, briefing, sidebar, engine status
- `src/App.tsx` — Todos los strings hardcoded migrados a `t.*` (errores, processing, greetings, onboarding, UI labels)
- `src/components/excel/ExcelChat.tsx` — Migrado completo (~90 strings): chat UI, mic/TTS buttons, rate-limit, errores, sugerencias, placeholders, status messages
- `src/components/layout/Sidebar.tsx` — Migrado completo a `t.*`
- `src/components/layout/EngineStatus.tsx` — Migrado completo a `t.*`
- `src/components/ui/ErrorBoundary.tsx` — Migrado via `ErrorFallback` wrapper
- `src/components/ui/MascotCustomizer.tsx` — Migrado completo
- `src/components/pdf/BriefingCard.tsx` — Migrado completo
- `src/components/pdf/PdfViewer.tsx` — Migrado completo
- `src/components/pdf/ChartFullButton.tsx` — Migrado completo
- `src/components/onboarding/OnboardingTour.tsx` — Migrado completo
- `src/components/dashboard/PdfProcessingCard.tsx` — Migrado completo

**API Locale Awareness:**
- `api/chat/index.ts` — `buildSystemPrompt(lang)` genera system prompt en ES/EN
- Frontend envía `lang: locale` en todos los fetch calls
- Summary, extract, chart-full prompts respetan idioma

**Funciones helper migradas:**
- `matchTypeLabel()` — Ahora acepta `t` como parámetro
- `describeNoChart()` — Ahora acepta `t` como parámetro
- `renderInlineWithCites()` — Ahora acepta `t` como parámetro
- `renderRichText()` — Ahora acepta `t` como parámetro
- `ModelPill()` — Usa `useLocale()` hook

**Build verificado:** `npx tsc -b` + `npx vite build` pasan sin errores
**Commits:** a1e3d75 (feat), a5d585b (fix)

---

## Decisiones clave

| Decisión | Razón |
|----------|-------|
| SVG puro en vez de librería externa | Sin dependencias nuevas (§34), control total |
| Canvas partículas detrás del SVG | Rendering behind robot, no interfere con ojos/brazos |
| `Mascota.css` como excepción a tokens | Colores de personaje no son UI — identidad del robot |
| `copixi:*` en events/localStorage | Backward compat, no romper localStorage de usuarios existentes |
| Ojos sin pupilas negras | Estilo EVE/robot cute, más natural con solo iris+brillo |
| Brazos `<rect rx="6">` | Capsule shapes — el fix que resolvió los brazos de palito |
| TTS con cooldowns | No repetir frases molestas |
| Inter como body font | UI Pro Max recomienda para AI tools, ya estaba en fallback chain |
| Calistoga para headings | Agrega calidez humana al robot, paired con Inter |
| Dark mode navy (#0F172A) | UI Pro Max pattern para AI dashboards, más profesional que verde oscuro |
| Focus ring con --color-tropical | Mejor contraste que --color-primary, visible en ambos modos |
| Landing bilingüe (ES/EN) | Makers Fellowship requiere EN; diccionario quirúrgico sin refactorizar producto |
| Locale default 'en' | Evaluadores Makers son angloparlantes; toggle ES accesible en sidebar |
| Producto i18n completo | Todos los strings del producto migrados al diccionario; app 100% bilingüe |
| Funciones helper con `t` param | `matchTypeLabel`, `describeNoChart` aceptan diccionario como parámetro |
| ALLOWED_ORIGINS vía env var | Preparado para cambio de dominio sin redeploy de código |

---

## Estado de branches

```
* main          ← todos los cambios sin commitear
  respaldo      ← backup antes de SVG/TTS
  robot         ← trabajo previo del robot
```

---

## Pendientes conocidos

1. **Commitear** los archivos de la sesión (i18n migration, landing, hardcoded audit, etc.)
2. **QA visual live** — verificar que todo se ve bien tras deploy (sin navegador en entorno)
3. **og:image** — `public/og-cover.png` 1200×630 pendiente de crear
4. **E2E completo** — PDF escaneado, mobile, oscuro, gráficas, citas en panel
5. **api/chat system prompt** — Hacer que respete el locale (pasar `lang` en request body)

---

## Cómo retomar

```bash
# 1. Verificar build
pnpm build

# 2. Verificar lint
pnpm lint

# 3. Dev server
pnpm dev

# 4. Cuando esté listo para commitear
git add -A
git commit -m "..."
git push
```

---

## Hardcoded audit — Decisiones (23/09)

| Valor | Línea | Decisión | Razón |
|-------|-------|----------|-------|
| `https://copixi.vercel.app` (ALLOWED_ORIGINS) | 36 | **CONFIG** (env var) | Preparado para cambio de dominio |
| `http://localhost:5173/3000` | 36 | **KEEP** en default | Dev local, harmless |
| `https://api.groq.com/...` | 224 | **KEEP** | Endpoint público estable de Groq |
| `https://openrouter.ai/...` | 256 | **KEEP** | Endpoint público estable de OpenRouter |
| `https://copixi.vercel.app` (HTTP-Referer) | 258 | **CONFIG** (env var `SITE_URL`) | OpenRouter ranking, cambiante |
| `MercurBot` (X-Title) | 259 | **CONFIG** (env var `SITE_NAME`) | OpenRouter display name |
| Model defaults (gemini-3.5-flash-lite, etc.) | 129-131 | **KEEP** | Defaults fallback, overrides via env |
| `http://www.w3.org/2000/svg` | Mascota.tsx | **KEEP** | XML namespace estándar, no es URL |
| System prompt ES | 133-152 | **KEEP** | No es secreto, hardcoded language ok |
| `GEMINI_API_KEY` refs en error strings | ChartFull/ExcelChat | **KEEP** | Solo nombres de variable, no valores |

---

## Stack recordatorio

- **Framework:** React + TypeScript
- **Build:** Vite
- **Package Manager:** pnpm
- **Estilos:** CSS nativo (nunca Tailwind)
- **Iconos:** Pixelarticons (nunca lucide/FA)
- **Robot:** SVG custom + Canvas partículas
- **TTS:** Web Speech API nativo
- **Sonidos:** Web Audio API (0 deps)
- **PDF:** pdfjs-dist
- **AI:** Vercel AI SDK + Gemini
- **Deploy:** Vercel

---

*"Los datos se quedan en el navegador."*
