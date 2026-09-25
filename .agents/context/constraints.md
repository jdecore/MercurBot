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
