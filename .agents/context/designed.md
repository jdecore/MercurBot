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
