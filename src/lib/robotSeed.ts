/**
 * Copixi Robot Seed — diseño determinista del robot desde un nombre (Fase B).
 * Mismo nombre = mismo diseño, siempre. Sin dependencias, sin backend.
 * Misma técnica de hash que src/lib/fileHash.ts (FNV-1a).
 */

export type RobotColorId = 'brasita' | 'miel' | 'salvia' | 'tinta' | 'arena' | 'cobre'
export type RobotEyes = 'round' | 'visor' | 'happy'
export type RobotAccessory = 'none' | 'antenna' | 'fins' | 'headphones' | 'tuft'

export interface RobotConfig {
  color: RobotColorId
  eyes: RobotEyes
  accessory: RobotAccessory
}

export interface RobotDesign extends RobotConfig {
  id: RobotColorId
  /** Nombre humano del diseño (para las pastillas del personalizador). */
  label: string
  /** Color principal del cuerpo. */
  hex: string
  /** Color del aura/hábitat derivado. */
  aura: string
}

/**
 * Los 6 diseños: cada color trae su propio diseño (ojos + accesorio
 * distintos), no solo un pintado. El usuario puede mezclar después
 * rasgo por rasgo en el personalizador.
 */
export const ROBOT_DESIGNS: Record<RobotColorId, RobotDesign> = {
  brasita: { id: 'brasita', label: 'Brasita', hex: '#B34A24', aura: '#B34A24', color: 'brasita', eyes: 'visor', accessory: 'antenna' },
  miel: { id: 'miel', label: 'Miel', hex: '#C99A2E', aura: '#C99A2E', color: 'miel', eyes: 'round', accessory: 'fins' },
  salvia: { id: 'salvia', label: 'Salvia', hex: '#6B7F5E', aura: '#6B7F5E', color: 'salvia', eyes: 'happy', accessory: 'headphones' },
  tinta: { id: 'tinta', label: 'Tinta', hex: '#2E2A26', aura: '#2E2A26', color: 'tinta', eyes: 'visor', accessory: 'none' },
  arena: { id: 'arena', label: 'Arena', hex: '#D9B98A', aura: '#B98A4A', color: 'arena', eyes: 'round', accessory: 'tuft' },
  cobre: { id: 'cobre', label: 'Cobre', hex: '#A05A2C', aura: '#A05A2C', color: 'cobre', eyes: 'happy', accessory: 'antenna' },
}

export const ROBOT_DESIGN_LIST: RobotDesign[] = Object.values(ROBOT_DESIGNS)

export const MAX_ROBOT_NAME = 24

export function sanitizeRobotName(raw: string, fallback = 'Copi'): string {
  const clean = raw.trim().slice(0, MAX_ROBOT_NAME)
  return clean || fallback
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Diseño base determinista desde el nombre del robot. */
export function designFromName(name: string): RobotConfig {
  const key = sanitizeRobotName(name).toLowerCase()
  const design = ROBOT_DESIGN_LIST[fnv1a(key) % ROBOT_DESIGN_LIST.length]
  return { color: design.color, eyes: design.eyes, accessory: design.accessory }
}
