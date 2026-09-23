# QA Visual Checklist — MercurBot i18n

## Build Status
- [x] `npx vite build` — passes (516.90 kB)
- [x] `pnpm lint` — 0 errors, 17 pre-existing warnings (hook deps)
- [x] No duplicate keys in locale.tsx
- [x] All API calls include `lang` parameter

## Locale Toggle
- [ ] Toggle ES/EN in sidebar (expanded mode)
- [ ] Toggle ES/EN in sidebar (rail mode)
- [ ] `document.documentElement.lang` updates to "en" or "es"
- [ ] Locale persists after page reload (check `copixi:preferences` in localStorage)

## Landing Page (when no PDF loaded)
- [ ] Hero section renders in EN (default)
- [ ] Hero section renders in ES after toggle
- [ ] All 9 sections render: Hero, How it works, What I built, Evolution, Validation, Why chemistry, Roadmap, Built with, Builder
- [ ] Section text matches selected locale

## Product UI (after PDF loaded)
- [ ] Sidebar strings in selected locale
- [ ] Chat input placeholder in selected locale
- [ ] Suggestion chips in selected locale
- [ ] Error messages in selected locale
- [ ] Processing status in selected locale
- [ ] Voice/TTS button labels in selected locale
- [ ] PDF viewer controls in selected locale

## API Locale Awareness
- [ ] Chat responses in selected language
- [ ] Summary (briefing) in selected language
- [ ] Chart generation in selected language
- [ ] System prompt respects locale

## Responsive
- [ ] Mobile viewport (< 768px)
- [ ] Tablet viewport (768-1024px)
- [ ] Desktop viewport (> 1024px)

## Dark Mode
- [ ] Landing page in dark mode
- [ ] Product UI in dark mode
- [ ] Locale toggle visible in both modes

## OG Image
- [ ] `public/og-cover.png` exists (1200×630)
- [ ] Meta tags in index.html reference correct image
- [ ] Image displays correctly when sharing URL
