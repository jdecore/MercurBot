# Voice Skill

## Propósito
Sesión de voz continua con barge-in, detector de silencio y TTS.

## Archivos clave
- `src/shared/lib/voiceSession.ts` — hook principal de voz
- `src/shared/lib/tts.ts` — texto a voz
- `src/shared/lib/dictation.ts` — integración con Web Speech API

## Cómo probarlo
1. Click en micrófono en el dock del chat
2. Hablar y verificar que el texto aparece en el input
3. Detener hablando y verificar auto-send tras 1.2s de silencio
4. Interrumpir con nueva voz (barge-in)

## Errores comunes
- Web Speech API no disponible: ocultar botón de mic
- Contexto no seguro (HTTP): mostrar warning
- TTS no soportado: ocultar botón de mute
