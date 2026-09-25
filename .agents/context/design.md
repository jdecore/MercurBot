# Design.md — Tema único MERCU (mar)

## Filosofía
El robot está sumergido en el mar (Océano Profundo). NO existe modo claro.
`prefers-color-scheme` no altera la paleta. No hay `body.light`, `galaxy-*`, ni gradientes de marca.

## Paleta (3 capas)

### Capa 0 — fuente (hex de marca)
- `--mercu-mineral: #E5E6E1` — texto y papel del visor
- `--mercu-ocean: #073B46` — color de marca y fondo
- `--mercu-ocean-surface: #0A4753` — superficie del mar
- `--mercu-ocean-deep: #052C35` — fondo abisal
- `--mercu-green: #9EE014` — biche: vegetación tropical, fruta verde
- `--mercu-orange: #F0711D` — naranja tropical: acento cálido principal
- `--mercu-red: #C92E0E` — rojo tropical: alerta / destructivo

### Capa 1 — derivados (accesibilidad)
- `--mercu-orange-ink: #FF9D52` — naranja como texto (5.00–5.92)
- `--mercu-red-ink: #FFA890` — rojo como texto (5.52–6.53)
- `--mercu-ink-on-warm: #062024` — tinta sobre naranja/biche (5.71 / 10.59)

### Capa 2 — semánticos
**Fondos:**
- `--color-bg: var(--mercu-ocean)` — fondo base
- `--color-surface: #0D4E5B` — card
- `--color-surface-2: #125E6B` — chip / hover elevado
- `--color-surface-hover: #14606F` — hover de superficie
- `--color-card: #0D4E5B` — alias de card
- `--color-border` — `color-mix(in srgb, var(--mercu-mineral) 16%, var(--mercu-ocean))`
- `--color-border-strong` — `color-mix(in srgb, var(--mercu-mineral) 26%, var(--mercu-ocean))`
- `--surface-blur: 16px`

**Texto:**
- `--color-text: var(--mercu-mineral)` — texto principal
- `--color-foreground: var(--mercu-mineral)` — alias
- `--color-muted: #C0CDCE` — secundario (6.31–7.47)
- `--color-muted-foreground: #C0CDCE` — alias

**Acentos:**
- `--color-primary: var(--mercu-orange)` — relleno, foco, borde, iconos
- `--color-primary-hover: #FF8A3D` — hover primary
- `--color-on-primary: var(--mercu-ink-on-warm)` — texto sobre primary
- `--color-action: var(--mercu-orange)` — alias CTA
- `--color-action-hover: #FF8A3D` — hover action
- `--color-on-action: var(--mercu-ink-on-warm)` — texto sobre action
- `--color-accent: var(--mercu-green)` — selección, energía, links
- `--color-accent-hover: #B6EE4A` — hover accent
- `--color-on-accent: var(--mercu-ink-on-warm)` — texto sobre accent
- `--color-accent-ink: var(--mercu-orange-ink)` — tinta de acento
- `--color-tropical: var(--mercu-green)` — alias documental
- `--color-tropical-hover: #B6EE4A` — hover tropical
- `--color-on-tropical: var(--mercu-ink-on-warm)` — texto sobre tropical
- `--color-ring: var(--mercu-orange)` — foco anillo
- `--color-tropical-green: var(--mercu-green)` — alias brief
- `--color-tropical-orange: var(--mercu-orange)` — alias brief
- `--color-tropical-red: var(--mercu-red)` — alias brief
- `--color-text-on-night: var(--mercu-mineral)` — alias brief

**Estados semánticos:**
- `--color-success: var(--mercu-green)`
- `--color-warning: var(--mercu-orange)`
- `--color-warning-ink: var(--mercu-orange-ink)`
- `--color-danger: var(--mercu-red)`
- `--color-danger-ink: var(--mercu-red-ink)`

**Softs / glows:**
- `--color-danger-soft` — `color-mix(in srgb, var(--mercu-red) 14%, transparent)`
- `--color-warning-soft` — `color-mix(in srgb, var(--mercu-orange) 14%, transparent)`
- `--color-accent-soft` — `color-mix(in srgb, var(--mercu-green) 12%, transparent)`
- `--color-primary-soft` — `color-mix(in srgb, var(--mercu-orange) 14%, transparent)`
- `--glow-orange` — `color-mix(in srgb, var(--mercu-orange) 38%, transparent)`
- `--glow-green` — `color-mix(in srgb, var(--mercu-green) 34%, transparent)`

**Robot MERCU:**
- `--robot-shell: var(--mercu-mineral)`
- `--robot-shell-light: #F2F3EF`
- `--robot-shell-shadow: #B7C0BC`
- `--robot-visor: #04262E`
- `--robot-visor-border: #0A4753`
- `--robot-neon: var(--mercu-orange)`
- `--robot-neon-bright: #FF8A3D`
- `--robot-neon-glow` — `color-mix(in srgb, var(--mercu-orange) 70%, transparent)`
- `--robot-neon-soft` — `color-mix(in srgb, var(--mercu-orange) 25%, transparent)`
- `--robot-accent: #FF9D52`

**Gryphon (El Grifo chibi cute) — paleta cobre:**
- `--gryph-feather: #fff7ed`
- `--gryph-feather-mid: #fde6d0`
- `--gryph-feather-shadow: #e8b4a0`
- `--gryph-mane: #d4926b`
- `--gryph-mane-deep: #a05a2c`
- `--gryph-mane-mid: #cb7a4a`
- `--gryph-body: #f5d6bf`
- `--gryph-body-shadow: #dca88e`
- `--gryph-body-outline: #9c5a2e`
- `--gryph-beak: #e8a04a`
- `--gryph-beak-deep: #b87333`
- `--gryph-beak-light: #fde6c8`
- `--gryph-eye: #b87333`
- `--gryph-eye-bright: #d4926b`
- `--gryph-eye-glow: rgba(184, 115, 51, 0.55)`
- `--gryph-cheek: rgba(212, 146, 107, 0.35)`
- `--gryph-claw: #3d2b1f`
- `--gryph-nose: #7a3b1a`
- `--slime-glow: radial-gradient(circle, rgba(184,115,51,0.22) 0%, transparent 70%)`

## Tokens de apoyo

### Spacing
- `--space-xs: 4px`
- `--space-sm: 8px`
- `--space-md: 16px`
- `--space-lg: 24px`
- `--space-xl: 32px`
- `--space-2xl: 48px`
- `--space-3xl: 64px`

### Radius
- `--radius-sm: 6px`
- `--radius-md: 10px`
- `--radius-lg: 16px`
- `--radius-full: 9999px`

### Tipografía
- `--font-display: "Calistoga", Georgia, "Times New Roman", serif`
- `--font-sans: "Inter", ui-sans-system, system-ui, ...`
- `--font-mono: ui-monospace, SFMono-Regular, ...`
- `--text-sm: 0.875rem` → `--text-3xl: 2.5rem`

### Shadows
- `--shadow-sm: 0 1px 3px rgba(2, 18, 23, 0.45)`
- `--shadow-md: 0 4px 12px rgba(2, 18, 23, 0.5), ...`
- `--shadow-glow: 0 0 20px var(--glow-orange)`
- `--shadow-glow-green: 0 0 18px var(--glow-green)`

### Transitions
- `--transition-fast: 120ms ease`
- `--transition-normal: 200ms ease`

## Reglas de uso
- Naranja `#F0711D` → relleno, borde, foco, iconos, series de chart. NUNCA texto pequeño (3.47–4.11).
- Naranja `#FF9D52` → naranja como texto (5.00–5.92).
- Biche `#9EE014` → selección, energía, links, indicadores. Seguro como texto en cualquier superficie (5.35+).
- Rojo `#C92E0E` → solo alerta/destructivo. Texto de error usa `#FFA890`.
- El 90% de la interfaz es mar (`#073B46`) + mineral (`#E5E6E1`).
- Usar `color-mix(in srgb, ...)` para todos los rgba; no meter hex azul/violeta/cyan/`#8b5cf6`/`#06B6D4`.
- Modo claro eliminado. No hay `body.light`, `prefers-color-scheme`, ni `galaxy-*`.

## Robot units (F4)
7 unidades remapeadas a familia tropical + océano/mineral:
- curio → biche `#9EE014`/`#B6EE4A`
- helix → océano `#0D4E5B`/`#125E6B`
- datum → océano `#073B46`/`#0A4753`
- synapse → océano profundo `#052C35`/`#073B46`
- nexus → mineral `#E5E6E1`/`#F2F3EF`
- vektor → cobre cálido `#D4926b`/`#CB7A4A`
- gaia → cobre `#B87333`/`#E8A04A`

## Assets (F5)
- `public/favicon.svg` → mark MERCU: biche + naranja sobre océano
- `public/og-cover.svg` → paleta MERCU (biche/orange/ocean)
- `index.html` → `theme-color` unificado a `#073B46`, sin `color-scheme`

## Verificación
```bash
pnpm build && pnpm lint
grep -rn 'galaxy-' src | wc -l      # → 0
grep -rn 'body.light' src | wc -l   # → 0
grep -rniE '#(8b5cf6|818cf8|6366f1|a78bfa|2563eb|60a5fa|38bdf8|06b6d4|47bfff|7e14ff)|cyan|violet|neon' src public/favicon.svg | wc -l  # → 0
```
