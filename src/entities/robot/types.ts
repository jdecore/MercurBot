export type MascotaMood =
  | 'neutro'
  | 'feliz'
  | 'enojado'
  | 'duda'
  | 'dormido'
  | 'guino'
  | 'hablando'
  | 'escuchando'
  | 'pensando'
  | 'exito'
  | 'limpiando'
  | 'escaneando';

export type RobotUnitId =
  | 'curio'    // Unit C-01: Ciencia
  | 'helix'    // Unit H-02: Biología Computacional & Limpieza
  | 'datum'    // Unit D-03: Datos & Taxonomía
  | 'synapse'  // Unit S-04: IA & Redes Neurales
  | 'nexus'    // Unit N-05: Tecnología & Pipeline
  | 'vektor'   // Unit V-06: Producto & Estrategia
  | 'gaia';    // Unit E-07: Ecosistemas & Orquestación

export type MascotVariant = RobotUnitId | 'gryph' | 'robot' | 'buho' | 'fenix' | 'kitsune1';

export interface RobotMetadata {
  id: RobotUnitId;
  code: string;
  name: string;
  domain: string;
  visorType: 'circle' | 'chromosome' | 'matrix4x4' | 'triangle' | 'chevron' | 'reticle' | 'fractal';
  primaryColor: string;
  accentColor: string;
  habitatName: string;
  tagline: string;
}

export const ROBOT_UNITS: Record<RobotUnitId, RobotMetadata> = {
  curio: {
    id: 'curio',
    code: 'UNIT C-01',
    name: 'CURIO-BOT',
    domain: 'Ciencia & Hipótesis',
    visorType: 'circle',
    primaryColor: '#9EE014',
    accentColor: '#B6EE4A',
    habitatName: 'Laboratorio de Espectrometría',
    tagline: 'Formula hipótesis rigurosas y preguntas científicas exploratorias.',
  },
  helix: {
    id: 'helix',
    code: 'UNIT H-02',
    name: 'HELIX-BOT',
    domain: 'Bio-Computación & Limpieza',
    visorType: 'chromosome',
    primaryColor: '#0D4E5B',
    accentColor: '#125E6B',
    habitatName: 'Cámara Criogénica & Secuenciador',
    tagline: 'Cura, alinea e imputa datos corrigiendo mutaciones e impurezas.',
  },
  datum: {
    id: 'datum',
    code: 'UNIT D-03',
    name: 'DATUM-BOT',
    domain: 'Datos & Taxonomía',
    visorType: 'matrix4x4',
    primaryColor: '#073B46',
    accentColor: '#0A4753',
    habitatName: 'Sala Blanca de Servidores',
    tagline: 'Data profiling determinista, histogramas y correlaciones exactas.',
  },
  synapse: {
    id: 'synapse',
    code: 'UNIT S-04',
    name: 'SYNAPSE-BOT',
    domain: 'IA & Inferencia Neural',
    visorType: 'triangle',
    primaryColor: '#052C35',
    accentColor: '#073B46',
    habitatName: 'Núcleo Sináptico Cuántico',
    tagline: 'Reconocimiento de patrones no lineales, clusters y anomalías profundas.',
  },
  nexus: {
    id: 'nexus',
    code: 'UNIT N-05',
    name: 'NEXUS-BOT',
    domain: 'Tecnología & Pipeline',
    visorType: 'chevron',
    primaryColor: '#E5E6E1',
    accentColor: '#F2F3EF',
    habitatName: 'Centro de Control & Telemetría',
    tagline: 'Automatización de visualizaciones, filtros dinámicos y pivots.',
  },
  vektor: {
    id: 'vektor',
    code: 'UNIT V-06',
    name: 'VEKTOR-BOT',
    domain: 'Productos & Estrategia',
    visorType: 'reticle',
    primaryColor: '#D4926b',
    accentColor: '#CB7A4A',
    habitatName: 'War Room Estratégica',
    tagline: 'Convierte análisis estadístico en decisiones ejecutivas de alto impacto.',
  },
  gaia: {
    id: 'gaia',
    code: 'UNIT E-07',
    name: 'GAIA-CORE',
    domain: 'Ecosistemas & Orquestación',
    visorType: 'fractal',
    primaryColor: '#B87333',
    accentColor: '#E8A04A',
    habitatName: 'Invernadero Orbital Digital',
    tagline: 'Orquesta el pipeline integral y conecta múltiples fuentes de datos.',
  },
};
