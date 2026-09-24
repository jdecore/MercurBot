# AGENTS.md — MercurBot | Mandamientos

> **LEER ANTES DE MODIFICAR EL PROYECTO.**

---

## 1. Qué es MercurBot

**AI PDF Analyst.** El usuario carga un PDF, se vectoriza en el navegador, y pregunta lo que quiera con citas verificables `[Pág. N]`.

---

## 2. Stack (no cambiar sin justificación §41)

| Categoría | Tecnología |
|-----------|------------|
| Framework | React + TypeScript |
| Build | Vite |
| Package Manager | **pnpm** (nunca npm/yarn/bun) |
| Estilos | CSS nativo + CSS Modules |
| UI Primitives | Radix UI |
| Iconos | **Pixelarticons** (nunca lucide/Heroicons/FA) |
| PDF | pdfjs-dist |
| AI | Vercel AI SDK + Gemini API |
| Deploy | Vercel |

---

## 3. Prohibiciones (NO ROMPER)

1. **Sin Tailwind/UnoCSS/Windi** — CSS nativo
2. **Sin shadcn/ui** — Radix UI + CSS propio
3. **Sin lucide/Heroicons/FA** — solo Pixelarticons
4. **Sin backend tradicional** — frontend-first, solo 1 Vercel Function proxy
5. **Sin `VITE_*` secrets** — API keys en server env vars
6. **Sin npm/yarn/bun** — solo pnpm
7. **Sin dependencias nuevas sin justificar** — ver §34

---

## 4. Privacidad

> **Los datos se quedan en el navegador.**

- Nunca subir el PDF completo a un servidor
- El LLM recibe solo Top 3 fragmentos RAG + contexto agregado
- Excepción documentada: "Generar gráfica" envía texto completo (tope 250KB) bajo consentimiento explícito del usuario

---

## 5. Seguridad

- `GEMINI_API_KEY` solo en `api/chat/index.ts` (server)
- Nunca exponer en frontend, logs, o respuestas
- CSP en `vercel.json` con `connect-src` para huggingface/jsdelivr (embeddings)
- Permissions-Policy hardened en `vercel.json`: deshabilita geolocation, camera, y features de ad-related/privacy-sandbox no utilizadas (`run-ad-auction`, `join-ad-interest-group`, `private-aggregation`, `attribution-reporting`, etc.)

---

## 9. Plan Galaxy 🌌 (Rediseño UI completo)

> **Autorizado:** 2026-09-23. Estilo cosmos oscuro en toda la app. Ver `memory.md` para detalle.

| Fase | Estado | Descripción |
|------|--------|-------------|
| 0 | ✅ | Fundación Galaxy — tokens + cielo estrellado |
| 1 | ✅ | Landing — robot 225px + halo + agujero negro centrado |
| 2 | ✅ | Sidebar → riel Galaxy oscuro translúcido |
| 3 | ✅ | Idioma auto (navigator + timezone) + robot por idioma (frío/cálido) |
| 4 | ✅ | Vista documento — robot orbe + anillo orbital + consola cristal + píldora flotante |
| 5 | ✅ | Quitar automatización (briefing, wayflow, starters, speakInteraction) |
| 6 | ✅ | Voz en vivo (sesión continua, auto-envío, barge-in, volumeMeter) |
| 7 | ✅ | Laya ONNX en caché + portero de embeddings (literal vs semántico) |
| 8 | ✅ | Diálogos cristal + QA final (pnpm build, grep, 1 Function, responsive) |

**Orden:** 0→1→2→3→4→5→8→6→7. Cada fase = 1 commit reversible.
**Dependencia nueva justificada §34:** `@receptron/laya` u `onnxruntime-web` (Fase 7, pesos ~650MB en Cache/OPFS, §4 intacta).

---

## 10. Quality Gate (antes de marcar done)

```
[ ] pnpm install / dev / build OK sin errores TS
[ ] Sin violaciones de stack (grep tailwind/shadcn/lucide)
[ ] Sin VITE_ secrets
[ ] Solo 1 Vercel Function (api/chat)
[ ] Responsive funciona
[ ] Error handling no deja pantalla vacía
```

---

## 11. Cambios Arquitectónicos

Si algo requiere cambiar stack, prohibiciones, o privacidad:

```
Current approach → Problem → Proposed change → Why → Trade-offs → Impact
```

Solo después de autorización. Actualizar este archivo.

---

## 12. Orden de Decisión

```
1. Simplicidad  2. Seguridad  3. UX  4. Performance  5. Mantenibilidad
```
