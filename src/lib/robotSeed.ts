/**
 * Copixi Robot Seed — diseño determinista del robot desde un nombre (Fase B).
 * Mismo nombre = mismo diseño, siempre. Sin dependencias, sin backend.
 * Misma técnica de hash que src/lib/fileHash.ts (FNV-1a).
 */

export type RobotColorId = 'brasita' | 'miel' | 'salvia' | 'tinta' | 'arena' | 'cobre' | 'oliva' | 'ciruela' | 'niebla' | 'teja' | 'mostaza' | 'musgo' | 'vino' | 'petroleo' | 'lavanda' | 'cafe' | 'melocoton' | 'pizarra' | 'lino'
export type RobotEyes = 'round' | 'visor' | 'happy' | 'sleepy' | 'big'
export type RobotAccessory = 'none' | 'antenna' | 'fins' | 'headphones' | 'tuft' | 'glasses' | 'bow' | 'cap'

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
  oliva: { id: 'oliva', label: 'Oliva', hex: '#7C7440', aura: '#7C7440', color: 'oliva', eyes: 'big', accessory: 'glasses' },
  ciruela: { id: 'ciruela', label: 'Ciruela', hex: '#8E4B5E', aura: '#8E4B5E', color: 'ciruela', eyes: 'sleepy', accessory: 'bow' },
  niebla: { id: 'niebla', label: 'Niebla', hex: '#5E7683', aura: '#5E7683', color: 'niebla', eyes: 'happy', accessory: 'cap' },
  teja: { id: 'teja', label: 'Teja', hex: '#BE6B3F', aura: '#BE6B3F', color: 'teja', eyes: 'round', accessory: 'none' },
  mostaza: { id: 'mostaza', label: 'Mostaza', hex: '#D9A62E', aura: '#B8891F', color: 'mostaza', eyes: 'happy', accessory: 'fins' },
  musgo: { id: 'musgo', label: 'Musgo', hex: '#5F7355', aura: '#5F7355', color: 'musgo', eyes: 'visor', accessory: 'tuft' },
  vino: { id: 'vino', label: 'Vino', hex: '#7A3B47', aura: '#7A3B47', color: 'vino', eyes: 'sleepy', accessory: 'none' },
  petroleo: { id: 'petroleo', label: 'Petróleo', hex: '#3E5C5B', aura: '#3E5C5B', color: 'petroleo', eyes: 'round', accessory: 'headphones' },
  lavanda: { id: 'lavanda', label: 'Lavanda', hex: '#7B6F8E', aura: '#7B6F8E', color: 'lavanda', eyes: 'big', accessory: 'bow' },
  cafe: { id: 'cafe', label: 'Café', hex: '#5C4632', aura: '#5C4632', color: 'cafe', eyes: 'visor', accessory: 'glasses' },
  melocoton: { id: 'melocoton', label: 'Melocotón', hex: '#D99B77', aura: '#B57A4E', color: 'melocoton', eyes: 'happy', accessory: 'tuft' },
  pizarra: { id: 'pizarra', label: 'Pizarra', hex: '#4A4E57', aura: '#4A4E57', color: 'pizarra', eyes: 'sleepy', accessory: 'cap' },
  lino: { id: 'lino', label: 'Lino', hex: '#C9B48A', aura: '#A8894F', color: 'lino', eyes: 'big', accessory: 'antenna' },
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
