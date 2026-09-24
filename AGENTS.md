# AGENTS.md — MercurBot

> **LEER ANTES DE MODIFICAR EL PROYECTO.**

---

## 1. Qué es

**AI PDF Analyst.** El usuario carga un PDF, se vectoriza en el navegador, y pregunta lo que quiera con citas verificables `[Pág. N]`.

---

## 2. Stack

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
7. **Sin dependencias nuevas sin justificar**

---

## 4. Privacidad

> **Los datos se quedan en el navegador.**

- Nunca subir el PDF completo a un servidor
- El LLM recibe solo Top 3 fragmentos RAG + contexto agregado
- Excepción: "Generar gráfica" envía texto completo (tope 250KB) bajo consentimiento explícito

---

## 5. Seguridad

- `GEMINI_API_KEY` solo en `api/chat/index.ts` (server)
- Nunca exponer en frontend, logs, o respuestas
- CSP en `vercel.json` con `connect-src` para huggingface/jsdelivr (embeddings + ONNX WASM CDN)
- Permissions-Policy hardened en `vercel.json`

---

## 6. Calidad (antes de marcar done)

```
[ ] tsc + vite build OK
[ ] Sin violaciones de stack
[ ] Sin VITE_ secrets
[ ] Solo 1 Vercel Function
[ ] Responsive OK
[ ] Error handling OK
```

---

## 7. Memoria del Agente (`memory.md`)

`memory.md` es la memoria persistente. Siempre leer al inicio y actualizar al terminar una tarea.

1. **Al inicio:** Leer `memory.md` completo
2. **Al terminar tarea:** Actualizar con qué se hizo, por qué, resultado, aprendizajes
3. **Si excede ~400 líneas:** Resumir entradas antiguas (3-5 líneas por sesión), agregar nueva info
