# MERCU Theme Implementation Plan

## Estado actual
- F1 parcial: tokens + gradiente + corriente marina en `src/shared/styles/global.css`
- F2 parcial: `src/app/App.css` limpio de `galaxy-*`, `body.light`, `prefers-color-scheme`
- Restos de color en `src/entities/robot/types.ts`, `public/favicon.svg`, `public/og-cover.svg`

## Fases pendientes

### F2.5 — Auditoría final de tokens en App.css
- Confirmar 0 refs `--galaxy-*`, `rgba(47,91,234)`, `rgba(169,190,255)`, hex azul/violeta
- Confirmar 0 `body.light` y 0 `prefers-color-scheme` en todo `src/`

### F3 — BlackHoleUpload como pozo marino
- `src/features/pdf-upload/BlackHoleUpload.tsx` + `.black-hole-*`
- Núcleo a `--mercu-ocean-deep`, anillo naranja→biche, partículas hue 25–45, glow cálido
- Cero cambios de geometría, timing, props, a11y ni nombre

### F4 — Robot bajo el mar
- `src/entities/robot/types.ts`: remap 7 units (cyan/blue/violet/indigo → familia tropical + océano/mineral, 2 tonos por unit)
- `src/shared/ui/MascotaSvg.css`: `--unit-primary/accent` a biche/naranja; subtítulos a tinte oceánico
- `src/lib/robotSeed.ts`: no tocar (documentado como fuera de scope)

### F5 — Assets
- `public/favicon.svg`: nuevo mark MERCU (naranja + biche sobre océano)
- `public/og-cover.svg`: recolorear `#06B6D4`/`#8B5CF6` a tokens MERCU
- `index.html`: unificar `theme-color` a `#073B46`, quitar `color-scheme`
- `public/og-cover.png` y `apple-touch-icon.png`: pendiente manual

### F6 — Debugger
- `src/shared/lib/debug.ts`: reemplazar color `#8b5cf6` por `--mercu-green` o `--mercu-orange`

### F7 — Docs
- Crear `.agents/context/design.md` con: tema único MAR, eliminación modo claro, tokens, ratios, reglas de acento
- Reescribir `design-system/mercurbot/MASTER.md` con paleta MERCU y corregir anti-patrón Heroicons/Lucide
- Entrada en `.agents/memory/memory.md`: decisión "light mode eliminado"

## Verificación
```bash
pnpm build && pnpm lint
grep -rn 'galaxy-' src | wc -l      # → 0
grep -rn 'body.light' src | wc -l   # → 0
grep -rniE '#(8b5cf6|818cf8|6366f1|a78bfa|2563eb|60a5fa|38bdf8|06b6d4|47bfff|7e14ff)|cyan|violet|neon' src public/favicon.svg | wc -l  # → 0 (excepto types.ts intencional)
```

## Riesgos
- Raster assets requieren tooling manual → quedan como pendiente explícito
- `types.ts` mantiene hexs azules hasta F4; no rompe build pero viola temporalmente la auditoría
