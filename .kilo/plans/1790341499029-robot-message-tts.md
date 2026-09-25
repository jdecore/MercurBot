# Plan: mover mensaje de “sin gráfica comparable” al robot + limpiar código muerto

## 1. Objetivo
- Mover el mensaje de `noChart` del chat al globo/subtítulo del robot y que se lea por TTS con el sistema actual.
- Quitar código muerto real: imports/funciones/claves de traducción que no se usan en runtime.
- No cambiar stack de TTS; no agregar ElevenLabs ni dependencias nuevas.

## 2. Cambios específicos

### 2.1 Mover mensaje al robot y TTS
**Archivo:** `src/widgets/excel/ExcelChat.tsx`
- Cuando `cleanedAi.noChart && cleanedAi.noChartText` sea true, disparar un evento de ventana único por respuesta:
  - Evento: `copixi:robot-message`
  - Payload: `{ text: string }`
  - Disparar una sola vez, no en cada render (por ejemplo, en el `useEffect` que escucha `messages`/`status` o donde se setea `done`).

**Archivo:** `src/app/App.tsx`
- Agregar `useEffect` para escuchar `copixi:robot-message`.
- Al recibirlo:
  - `setMascotaSubtitulo(text)`
  - `speak(text)`
  - Opcional: resetear subtítulo después de unos segundos con `setTimeout`.

### 2.2 Limpiar código muerto
**Archivo:** `src/widgets/excel/ExcelChat.tsx`
- Eliminar importación de `clearChatHistory` si sigue sin usarse después de la limpieza anterior.
- Eliminar la firma/prop `onOpenFilePicker` si ya no se usa.

**Archivo:** `src/shared/lib/locale.tsx`
- Eliminar claves de traducción que no se usan en runtime actual:
  - `startersTitle`, `startersDesc`, `startersUpload`, `startersGroup`
  - `suggestSummary`, `suggestSummaryQ`, `suggestResume`, `suggestResumeQ`
  - `suggestCite`, `suggestCiteQ`, `suggestSearch`, `suggestSearchQ`, `suggestChart`, `suggestChartQ`
- Eliminar tipos/llaves en `LandingDict` / `ProductDict` asociadas a esas cadenas.

**Otros archivos**
- Revisar si existen funciones/components marcados como no usados y eliminarlos solo si no hay referencias en runtime.

## 3. Riesgos
- Si se eliminan traducciones que se usan en el futuro, habrá que reincorporarlas.
- El evento debe ser idempotente por respuesta; si se dispara repetido, el robot hablará varias veces.

## 4. Validación
- `pnpm build` debe compilar sin errores.
- Probar flujo: subir PDF, preguntar algo sin cifras comparables, verificar que el mensaje salga en el robot y se lea por TTS, y que no quede basura visible en consola/build.

## 5. Pregunta abierta (para resolver antes de ejecutar)
- ¿Quieres eliminar también las traducciones/código de starters/suggesters aunque eso implique quitar esa rama de la UI futura? Si no, dejarlas como están.
