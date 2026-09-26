# 1790384576469-theme-background-cards-contrast.md

## Objetivo
Cambiar fondo a `#0f172a`, las cards a un color más claro para contraste, y la sidebar a un tono coherente con la nueva base.

## Cambios
1. `src/shared/styles/global.css` — variables del tema:
   - `--mercu-ocean`: `#0f172a`
   - `--mercu-ocean-surface`: `#131c31`
   - `--mercu-ocean-deep`: `#0b1120`
   - `--color-bg`: `#0f172a`
   - `--color-surface` / `--color-card`: `#1e293b`
   - Ajustar `--color-border`, `--color-border-strong`, `--color-surface-2`, `--color-surface-hover` para que sigan teniendo sentido sobre `#0f172a`.
   - Revisar `--color-text` / `--color-muted`; mantenerlos sobre la nueva base.

2. `src/app/App.css` — body:
   - Reemplazar el gradiente actual por uno basado en los nuevos `--mercu-ocean-surface` / `--mercu-ocean-deep`.
   - Sidebar: ya usa `color-mix(..., var(--mercu-ocean-deep) ...)`, así que con el nuevo `#0b1120` queda coherente automáticamente.

3. Validación:
   - `pnpm build`
   - `pnpm lint`
   - Verificar contraste visual de cards, sidebar, bordes y texto en vistas principales.
