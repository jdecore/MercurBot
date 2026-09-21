# memory.md — Diario de Agente

> **Última actualización:** 2026-09-20 | Rama: `main`

---

## Estado actual (live)

El deploy en `https://copixi.vercel.app/` tiene hasta **Fase 44** (sidebar estilo Copilot + modelos elegidos por el usuario). Los cambios de la sesión del 20/09 (rename a MercurBot/Mercur, SVG robot, ojos, brazos, TTS, sonidos, animaciones) están **sin commitear**.

---

## Qué hay sin commitear (16 archivos)

Branding: `Copixi→MercurBot`, robot `Copi→Mercur` (no confundir con "Hera" — era un nombre temporal descartado).

Archivos modificados:
```
AGENTS.md, README.md, api/chat/index.ts, index.html
src/App.css, src/App.tsx, src/components/excel/ExcelChat.tsx
src/components/onboarding/OnboardingTour.tsx, src/components/ui/ErrorBoundary.tsx
src/data/universalParser.ts, src/lib/dictation.ts, src/lib/docLibrary.ts
src/lib/fileHash.ts, src/lib/ragPipeline.ts, src/lib/robotSeed.ts
src/lib/storage.ts, src/lib/tts.ts
```

---

## Qué se hizo en la última sesión

### Auditoría destructiva (seguridad + funcional + UI)
- 14/14 fixes de código estáticos (rate-limit, CSP, XSS)
- 17/17 fixes CSS (responsive, overflow, tokens)
- QA live con Chromium headless
- Eliminación de Blobatar (dependencia innecesaria)

### Robot SVG
- Reescritura completa del SVG: proporciones EVE, visor marrón, mejillas 35%, respiración 6s
- Brazos tipo cápsula (`<rect rx="6">`) — el fix definitivo de los brazos de palito
- Ojos: esclera blanca + iris coloreado + brillo, sin pupilas negras
- **Sistema de ojos (10 features):**
  1. Seguimiento de cursor con lerp (0.08), clamp ±5/±3px
  2. Sacádicas cada 2-5s (pausadas en hover)
  3. Parpadeo random 2.2-6s, 30% doble
  4. Dilatación por mood (feliz +15%, dormido -45%, etc.)
  5. Tracking de elementos UI vía `copixi:eye-target`
  6. Interactivo: hover→doble parpadeo, click→guiño, leave→centro
  7. Cejas sobre el visor con rotación por mood
  8. Mood especiales: exito glow, dormido Z's, pensando dots, guino wink
  9. Parallax 3D: sombra de profundidad en esclera
  10. Reacción a typing/submit/streaming

### Canvas partículas
- `<canvas>` detrás del SVG con polvo ambiental + partículas coloreadas por mood

### TTS
- `speakMood()` + `speakInteraction()` con cooldowns
- Web Speech API, `es-ES`, sin dependencias
- Wired en: ExcelChat, PdfViewer, App.tsx

### Sonidos (Web Audio API, 0 deps)
- pop, chime, startThinking, stopThinking, success, error, click, whoosh, greeting

### Animaciones avanzadas
- shakeHard, bounceUp, headBob, thinkEyes, sleepPulse
- Todas con `prefers-reduced-motion`

### Onboarding rediseñado
- 3 pasos: intro+names, themes+eyes+random, instructions
- Preview vivo del robot durante el bautizo

### Customizer rediseñado
- Tabs "Estilo" y "Detalles"
- Sección "Unidad base" eliminada

### CSS restaurado
- MascotCustomizer dialog CSS (~200 líneas) restaurado después de perderse al borrar Mascota.css

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

---

## Estado de branches

```
* main          ← todos los cambios sin commitear
  respaldo      ← backup antes de SVG/TTS
  robot         ← trabajo previo del robot
```

---

## Pendientes conocidos

1. **Commitear** los 16 archivos de la sesión 20/09
2. **memory.md** — este archivo (completado)
3. **QA visual live** — verificar que todo se ve bien tras deploy (sin navegador en entorno)
4. **og:image** — `public/og-cover.png` 1200×630 pendiente de crear
5. **E2E completo** — PDF escaneado, mobile, oscuro, gráficas, citas en panel

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
