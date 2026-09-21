# MercurBot — Analista de PDF con IA

**Sube un PDF → se vectoriza en tu navegador → pregunta lo que quieras con citas verificables `[Pág. N]`.**

> Tu equipo tiene PDFs (manuales, reportes, contratos). MercurBot los convierte en respuestas verificables **sin subir el documento a ningún servidor**.

| | |
|---|---|
| **0$ de infraestructura** | Despliegas en Vercel en 2 minutos, sin servidores ni DB. |
| **Privacidad por diseño** | El PDF nunca sale del navegador; la IA solo recibe 3 fragmentos. |
| **Costo mínimo** | RAG local híbrido (vectorial + léxico). Free tier viable en producción. |
| **Citas verificables** | Cada dato viene con `[Pág. N]` — nada de alucinaciones, todo trazable. |
| **Sin registro** | Sube un PDF y pregunta. Tus usuarios llegan al "wow" sin fricción. |

---

## Desarrollo

```bash
pnpm install && pnpm dev     # http://localhost:5173
```

Requisitos: Node 20+, pnpm. Copia `.env.example` → `.env.local` y agrega `GEMINI_API_KEY=`.

**Deploy Vercel:** importa repo → Framework Vite → env vars → listo.

### Variables de entorno (solo server)

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `GEMINI_API_KEY` | Sí | — | API key de Google AI Studio |
| `GROQ_API_KEY` | No | — | Fallback Groq (gratuito) |
| `OPENROUTER_API_KEY` | No | — | Fallback OpenRouter |
| `GEMINI_MODEL` | No | `gemini-3.5-flash-lite` | Modelo Gemini |
| `GROQ_MODEL` | No | `qwen/qwen3.8-27b` | Modelo Groq |
| `OPENROUTER_MODEL` | No | `z-ai/glm-5.2:free` | Modelo OpenRouter |
| `ALLOWED_ORIGINS` | No | `copixi.vercel.app,localhost:5173,localhost:3000` | CORS whitelist (comma-separated) |
| `SITE_URL` | No | `https://copixi.vercel.app` | HTTP-Referer para OpenRouter |
| `SITE_NAME` | No | `MercurBot` | X-Title para OpenRouter |

### Stack

| | |
|---|---|
| Framework | React 19 · TypeScript · Vite · pnpm |
| UI | CSS nativo + tokens · Radix UI · Pixelarticons |
| PDF/RAG | pdfjs-dist · MiniSearch · MiniLM (Web Worker + OPFS) |
| IA | Gemini → Groq → OpenRouter (fallback chain, SSE streaming) |
| Backend | 1 Vercel Function (`api/chat/index.ts`) |

### Arquitectura

```
Browser: React + pdfjs → RAG local (MiniSearch + MiniLM)
    → /api/chat (Vercel Function) → Gemini/Groq/OpenRouter
    → streaming con citas [Pág. N] verificables
```

El PDF, la extracción, el chunking, los embeddings y la fusión RRF corren 100% en el navegador. La Function solo protege la API key y valida input.

### Seguridad

- PDF nunca subido al servidor; la IA recibe solo 3 fragmentos con página
- API keys solo en server env vars, nunca en frontend ni logs
- Solo se aceptan PDFs (30 MB); rate-limit 20 req/min
- Excepción documentada: "Generar gráfica" envía texto completo (máx. 250 KB) bajo consentimiento explícito del usuario
