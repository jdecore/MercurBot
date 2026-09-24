# Plan: Verify Migration + Update Dependencies

## Context

The previous agent completed the migration from `@xenova/transformers` to `@huggingface/transformers` v4 and updated the CSP in `vercel.json`. The user requested verification that the migration is complete and a search for newer stable versions of all dependencies.

## Current State

- **Migration**: `@xenova/transformers` → `@huggingface/transformers` v4 is complete in all active code (only remains in old plan files under `.kilo/plans/`)
- **CSP**: Updated — `script-src` uses `'wasm-unsafe-eval'` instead of `'unsafe-eval'`
- **Build**: Passes (as reported by previous agent)
- **onnxruntime-web**: 1.30.0 pinned, referenced in `src/lib/laya.ts` CDN URL

## Tasks

### 1. Verify Migration Completeness
- [ ] Grep for `@xenova/transformers` in active code (`.kilo/plans/` is historical, not active)
- [ ] Confirm all imports reference `@huggingface/transformers`
- [ ] Run `pnpm build` and verify zero errors
- [ ] Run `pnpm lint` and verify zero errors

### 2. Version Research
Check latest stable versions for all dependencies:

| Package | Current | Target | Risk |
|---------|---------|--------|------|
| @huggingface/transformers | ^4.3.0 | 4.3.0 | none |
| onnxruntime-web | 1.30.0 | 1.29.0+ | low (dev version ahead of stable) |
| react | ^19.2.8 | 19.2.8 | none |
| react-dom | ^19.2.8 | 19.2.8 | none |
| vite | ^8.2.0 | 8.2.2 | none |
| @vitejs/plugin-react | ^6.0.4 | 6.1.1 | low |
| oxlint | ^1.75.0 | 1.81.0 | low |
| @types/react | ^19.2.17 | 19.2.18 | none |
| @types/react-dom | ^19.2.3 | 19.2.7 | none |
| @types/node | ^24.13.3 | TBD | none |
| typescript | ~6.0.2 | 7.0.2 | **HIGH** (major bump) |
| pdfjs-dist | ^6.3.289 | 6.3.289 | none |
| minisearch | ^7.2.0 | 7.2.0 | none |
| pixelarticons | ^2.4.1 | 2.4.1 | none |
| @google/generative-ai | ^0.24.1 | **DEPRECATED** | **HIGH** (API change to @google/genai) |
| @radix-ui/react-dialog | ^1.1.15 | TBD | none |
| @radix-ui/react-select | ^2.2.6 | TBD | none |
| @radix-ui/react-tooltip | ^1.2.8 | TBD | none |
| wayflow | ^0.3.0 | TBD | none |

### 3. Update Dependencies

**Safe updates (minor/patch, no code changes expected):**
- [ ] `@vitejs/plugin-react`: 6.0.4 → 6.1.1
- [ ] `oxlint`: 1.75.0 → 1.81.0
- [ ] `@types/react`: 19.2.17 → 19.2.18
- [ ] `@types/react-dom`: 19.2.3 → 19.2.7
- [ ] `@types/node`: 24.13.3 → latest stable
- [ ] `@radix-ui/*` packages if newer patch versions exist
- [ ] `wayflow` if newer patch version exists

**Major/risky updates (require decision):**
- [ ] `typescript`: 6.0.2 → 7.0.2 (native port, 10x faster, but major API changes possible)
- [ ] `@google/generative-ai` → `@google/genai` (deprecated package, complete API rewrite)

**Re-evaluate onnxruntime-web:**
- [ ] Confirm if 1.30.0 is correct stable or if it should be reverted to 1.29.0
- [ ] Update CDN URL in `src/lib/laya.ts` if version changes

### 4. Validation
- [ ] Run `pnpm build` after all updates
- [ ] Run `pnpm lint` after all updates
- [ ] Verify no `@xenova/transformers` references remain in active code
- [ ] Verify CSP still uses `'wasm-unsafe-eval'` only (no `'unsafe-eval'`)
- [ ] Check for TypeScript compilation errors
- [ ] Check for new peer dependency warnings

## Risks

1. **TypeScript 6.0.2 → 7.0.2**: Major version bump with native port. May introduce breaking changes in type checking or build configuration.
2. **@google/generative-ai deprecation**: Package is legacy; migrating to `@google/genai` requires rewriting API calls in `api/chat/index.ts`.
3. **onnxruntime-web version mismatch**: 1.30.0 appears ahead of npm's listed latest (1.29.0). Need to verify if this is intentional.
4. **@huggingface/transformers API compatibility**: Confirm v4.3.0 API matches usage in `rag.worker.ts` (pipeline, env, progress_callback).

## Open Questions

1. Should we update TypeScript from 6.0.2 → 7.0.2? (risk: breaking changes in major version)
2. Should we migrate from deprecated `@google/generative-ai` to `@google/genai`? (risk: complete API rewrite)
3. What is the correct stable version of `onnxruntime-web` — 1.30.0 or 1.29.0?
