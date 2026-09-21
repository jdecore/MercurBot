import type { NodeTypeDefinition } from 'wayflow'

export const loopPagesNode: NodeTypeDefinition = {
  label: 'Iterar páginas',
  category: 'MercurBot',
  icon: 'file',
  ports: {
    inputs: [
      { id: 'from', dataType: 'number', label: 'Desde' },
      { id: 'to', dataType: 'number', label: 'Hasta' },
    ],
    outputs: [
      { id: 'page', dataType: 'number', label: 'Página' },
      { id: 'done', dataType: 'boolean', label: 'Fin' },
    ],
  },
  configSchema: {
    step: { type: 'number', label: 'Paso', default: 1 },
  },
}
