import type { SVGProps } from 'react'
import { WarningDiamond } from 'pixelarticons/react/WarningDiamond.js'
import { Close } from 'pixelarticons/react/Close.js'
import { File } from 'pixelarticons/react/File.js'
import { Folder } from 'pixelarticons/react/Folder.js'
import { Pause } from 'pixelarticons/react/Pause.js'
import { Reload } from 'pixelarticons/react/Reload.js'
import { Send } from 'pixelarticons/react/Send.js'
import { Trash } from 'pixelarticons/react/Trash.js'
import { Upload } from 'pixelarticons/react/Upload.js'
import { Volume } from 'pixelarticons/react/Volume.js'
import { VolumeX } from 'pixelarticons/react/VolumeX.js'
import { Message } from 'pixelarticons/react/Message.js'
import { ChevronUp } from 'pixelarticons/react/ChevronUp.js'
import { Search } from 'pixelarticons/react/Search.js'
import { Copy } from 'pixelarticons/react/Copy.js'
import { Download } from 'pixelarticons/react/Download.js'
import { Mic } from 'pixelarticons/react/Mic.js'
import { Robot } from 'pixelarticons/react/Robot.js'
import { User } from 'pixelarticons/react/User.js'

const MAP = {
  alert: WarningDiamond,
  close: Close,
  file: File,
  folder: Folder,
  pause: Pause,
  reload: Reload,
  send: Send,
  trash: Trash,
  upload: Upload,
  volume: Volume,
  'volume-x': VolumeX,
  message: Message,
  'chevron-up': ChevronUp,
  search: Search,
  copy: Copy,
  download: Download,
  mic: Mic,
  robot: Robot,
  user: User,
} as const

export type IconName = keyof typeof MAP

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

/**
 * Iconos Pixelarticons como SVG inline (AGENTS.md §18: solo Pixelarticons).
 * Sustituye al woff2 con <i> vacíos, que no renderizaba ningún glifo.
 *
 * Escala del rediseño Fase 5: 14 denso (inline, chips, summaries),
 * 16 UI (botones), 18+ destacado (alertas, emblema del dropzone).
 */
export function Icon({ name, size = 16, ...props }: IconProps) {
  const C = MAP[name]
  return <C width={size} height={size} aria-hidden="true" focusable="false" {...props} />
}
