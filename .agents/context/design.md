# Design.md — Tema único MERCU (mar)

## Filosofía
El robot está sumergido en el mar (Océano Profundo). NO existe modo claro.

## Paleta (3 capas)

### Capa 0 — fuente (hex de marca)
- `--mercu-mineral: #E5E6E1` — texto y papel del visor
- `--mercu-ocean: #073B46` — color de marca y fondo
- `--mercu-ocean-surface: #0A4753` — superficie del mar
- `--mercu-ocean-deep: #052C35` — fondo abisal
- `--mercu-green: #9EE014` — biche: vegetación tropical
- `--mercu-orange: #F0711D` — naranja tropical: acento cálido
- `--mercu-red: #C92E0E` — rojo tropical: alerta/destructivo

### Capa 1 — derivados (accesibilidad)
- `--mercu-orange-ink: #FF9D52` — naranja como texto (5.00–5.92)
- `--mercu-red-ink: #FFA890` — rojo como texto (5.52–6.53)
- `--mercu-ink-on-warm: #062024` — tinta sobre naranja/biche (5.71/10.59)

### Capa 2 — semánticos
- `--color-primary: var(--mercu-orange)` — relleno, foco, borde, iconos
- `--color-accent: var(--mercu-green)` — selección, energía, links
- `--color-text: var(--mercu-mineral)` — texto principal
- `--color-surface: #0D4E5B` — card
- `--color-surface-2: #125E6B` — chip/hover
- `--color-border` — `color-mix(in srgb, var(--mercu-mineral) 16%, var(--mercu-ocean))`

## Reglas de uso
- Naranja `#F0711D` → relleno, borde, foco, iconos, series de chart. NUNCA texto pequeño (3.47–4.11).
- Naranja `#FF9D52` → naranja como texto (5.00–5.92).
- Biche `#9EE014` → selección, energía, links, indicadores. Seguro como texto en cualquier superficie (5.35+).
- Rojo `#C92E0E` → solo alerta/destructivo. Texto de error usa `#FFA890`.
- El 90% de la interfaz es mar (`#073B46`) + mineral (`#E5E6E1`).
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
