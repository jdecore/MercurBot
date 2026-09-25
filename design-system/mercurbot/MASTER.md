# Design System Master File — MERCU Theme

> **Project:** MercurBot
> **Theme:** Deep Ocean (único, sin modo claro)
> **Stack:** React + TypeScript + Vite + CSS nativo + Radix UI + Pixelarticons

---

## Global Rules

### Tema único MAR

El robot está sumergido en el mar profundo. NO existe modo claro.
`prefers-color-scheme` no altera la paleta. No hay `body.light`, `galaxy-*`, ni gradientes de marca.

### Color Palette (3 capas)

| Capa | Role | Hex | CSS Variable |
|------|------|-----|--------------|
| 0 | Mineral | `#E5E6E1` | `--mercu-mineral` |
| 0 | Ocean | `#073B46` | `--mercu-ocean` |
| 0 | Ocean Surface | `#0A4753` | `--mercu-ocean-surface` |
| 0 | Ocean Deep | `#052C35` | `--mercu-ocean-deep` |
| 0 | Biche | `#9EE014` | `--mercu-green` |
| 0 | Orange | `#F0711D` | `--mercu-orange` |
| 0 | Red | `#C92E0E` | `--mercu-red` |
| 1 | Orange Ink | `#FF9D52` | `--mercu-orange-ink` |
| 1 | Red Ink | `#FFA890` | `--mercu-red-ink` |
| 1 | Ink on Warm | `#062024` | `--mercu-ink-on-warm` |
| 2 | Primary | `var(--mercu-orange)` | `--color-primary` |
| 2 | Accent | `var(--mercu-green)` | `--color-accent` |
| 2 | Text | `var(--mercu-mineral)` | `--color-text` |
| 2 | Surface | `#0D4E5B` | `--color-surface` |
| 2 | Surface 2 | `#125E6B` | `--color-surface-2` |
| 2 | Border | `color-mix(...)` | `--color-border` |

**Color Notes:**
- Naranja `#F0711D` → relleno, borde, foco, iconos, series. NUNCA texto pequeño (3.47–4.11).
- Naranja `#FF9D52` → naranja como texto (5.00–5.92).
- Biche `#9EE014` → selección, energía, links, indicadores. Seguro como texto (5.35+).
- Rojo `#C92E0E` → solo alerta/destructivo. Texto de error usa `#FFA890`.
- 90% de la interfaz es mar + mineral.

### Typography

- **Heading Font:** Calistoga
- **Body Font:** Inter
- **Mood:** submarine, mineral, tropical, cinematic, technical, precision

```css
@import url('https://fonts.googleapis.com/css2?family=Calistoga&family=Inter:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Tight gaps |
| `--space-sm` | `8px` | Icon gaps |
| `--space-md` | `16px` | Standard padding |
| `--space-lg` | `24px` | Section padding |
| `--space-xl` | `32px` | Large gaps |
| `--space-2xl` | `48px` | Section margins |
| `--space-3xl` | `64px` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 3px rgba(2,18,23,0.45)` | Subtle lift |
| `--shadow-md` | `0 4px 12px rgba(2,18,23,0.5)` | Cards, buttons |
| `--shadow-glow` | `0 0 20px var(--glow-orange)` | Orange glow |
| `--shadow-glow-green` | `0 0 18px var(--glow-green)` | Biche glow |

---

## Component Specs

### Buttons

```css
.btn {
  background: color-mix(in srgb, var(--mercu-mineral) 4%, transparent);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: 10px;
  padding: 8px 14px;
}

.btn-primary {
  background: var(--color-action);
  border-color: transparent;
  color: var(--color-on-action);
}
```

### Cards

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
```

### Inputs

```css
.input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
}

.input:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mercu-orange) 25%, transparent);
}
```

---

## Style Guidelines

**Style:** Marine-native, mineral surfaces, bioluminescent accents

**Keywords:** submarine, mineral, tropical, cinematic, technical, precision, clean, premium, developer

**Key Effects:**
- `color-mix(in srgb, ...)` para todos los rgba
- `background-attachment: fixed` en gradiente de profundidad del body
- Corriente marina animada (`mercu-current`) en `body::before`
- `prefers-reduced-motion` congela animaciones

### Page Pattern

**Pattern Name:** Immersive PDF Canvas

- Sin navbar tradicional
- Gradiente de profundidad monocromático en body
- Textura de grano mineral en `.canvas-wrapper`
- Robot mascota flotando
- Upload tipo agujero negro (pozo marino en F3)

---

## Anti-Patterns (Do NOT Use)

- ❌ Tailwind/UnoCSS/Windi — usar CSS nativo
- ❌ shadcn/ui — Radix UI + CSS propio
- ❌ lucide/Heroicons/FA — solo Pixelarticons
- ❌ Emojis como iconos
- ❌ Modo claro (`body.light`, `prefers-color-scheme`)
- ❌ Paleta `galaxy-*`, cyan, violet, neon, `#8b5cf6`, `#06B6D4`
- ❌ Gradientes de marca (reemplazados por relleno plano + tokens)
- ❌ `VITE_*` secrets en frontend
- ❌ Dependencias nuevas sin justificar

---

## Pre-Delivery Checklist

- [ ] No emojis como iconos (usar Pixelarticons SVG)
- [ ] Todos los iconos del mismo set (Pixelarticons)
- [ ] `cursor: pointer` en elementos clickeables
- [ ] Transiciones suaves (150-300ms)
- [ ] Contraste 4.5:1 mínimo (ver ratios en capa 1)
- [ ] Estados de foco visibles para a11y
- [ ] `prefers-reduced-motion` respetado
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] `grep -rn 'galaxy-' src | wc -l` → 0
- [ ] `grep -rn 'body.light' src | wc -l` → 0
- [ ] `grep -rniE '#(8b5cf6|818cf8|6366f1|a78bfa|2563eb|60a5fa|38bdf8|06b6d4|47bfff|7e14ff)|cyan|violet|neon' src public/favicon.svg | wc -l` → 0
