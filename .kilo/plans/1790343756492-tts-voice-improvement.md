# Plan: Mejorar TTS del robot

## Problema actual

- `ExcelChat.tsx` usa `firstSentence()` para TTS: lee solo la primera frase (~180 chars).
- Eso hace que respuestas largas como *"Hola. Tras revisar el documento... no incluyen datos numéricos..."* se corten en *"Hola."* y el usuario no escucha el mensaje real del robot.
- Además, la selección de voz en `tts.ts` es frágil: solo busca nombres que incluyan `Natural`, `Google` o `Neural`, y en muchos navegadores/devices la voz disponible no matchea.

## Objetivo

Que el robot **lea el texto completo del globo de chat** (o un fragmento significativo), con una voz de mejor calidad cuando esté disponible, sin agregar dependencias.

## Cambios propuestos

### 1. Reemplazar `firstSentence()` por `speechText()`

**Archivo:** `src/widgets/excel/ExcelChat.tsx`

Eliminar `firstSentence()` y usar una función que:
- Saque markdown/código/citas `[Pág. N]`
- Devuelva hasta ~350 caracteres completando en el corte de palabra
- Si el texto es más largo, agregue *"…"* al final para indicar truncado

```ts
function speechText(text: string): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, 'código omitido.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[Pág\.?\s*\d+\]/gi, '')
    .replace(/\[Página\s*\d+\]/gi, '')
    .replace(/[#*_~>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= 350) return cleaned
  const slice = cleaned.slice(0, 350)
  const lastSpace = slice.lastIndexOf(' ')
  return lastSpace > 280 ? slice.slice(0, lastSpace) + '…' : slice + '…'
}
```

Luego reemplazar todos los `speak(firstSentence(...))` por `speak(speechText(...))`.

### 2. Mejorar `pickVoice()` en `tts.ts`

**Archivo:** `src/shared/lib/tts.ts`

La selección actual es muy específica con nombres. Cambiar a:

```ts
function pickVoice(): SpeechSynthesisVoice | null {
  if (!isSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  const lang = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : 'es'
  const isEs = lang === 'es'

  const candidates = voices.filter(v => v.lang.startsWith(isEs ? 'es' : 'en'))
  const preferred = candidates.find(v => /natural|neural|google|premium|advanced/i.test(v.name))
  return preferred ?? candidates[0] ?? null
}
```

### 3. Ajustar rate/pitch por idioma

**Archivo:** `src/shared/lib/tts.ts`

```ts
const isEs = (voice?.lang ?? '').startsWith('es')
utterance.rate = isEs ? 0.95 : 1.02
utterance.pitch = isEs ? 1.0 : 1.05
```

El español suena más natural un poco más lento; el inglés puede ir un poco más rápido.

### 4. Mantener `speak()` como API única

No cambiar la firma de `speak()`, `cancel()`, `setMuted()`. El cambio es transparente para el resto del código.

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/shared/lib/tts.ts` | Mejorar `pickVoice()` + ajuste rate/pitch por idioma |
| `src/widgets/excel/ExcelChat.tsx` | Reemplazar `firstSentence()` por `speechText()` y actualizar llamadas |

## Riesgos

- Web Speech API varía por browser/OS; la mejora de voz es best-effort.
- Textos muy largos siguen truncados, pero ahora con ~350 chars y corte por palabra en vez de 180 chars fijos.

## Validación

- `pnpm build` verde.
- Probar en Chrome/Safari con voz en español e inglés: confirmar que se lee más contenido del globo, con voz más natural cuando esté disponible.
