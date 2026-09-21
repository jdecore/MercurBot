import type { NodeTypeDefinition } from 'wayflow'

export const conditionPageNode: NodeTypeDefinition = {
  label: 'Condición por página',
  category: 'MercurBot',
  icon: 'search',
  ports: {
    inputs: [
      { id: 'page', dataType: 'number', label: 'Página' },
      { id: 'threshold', dataType: 'number', label: 'Umbral' },
    ],
    outputs: [
      { id: 'true', dataType: 'boolean', label: 'Verdadero' },
      { id: 'false', dataType: 'boolean', label: 'Falso' },
    ],
  },
  configSchema: {
    operator: {
      type: 'select',
      label: 'Operador',
      options: ['>', '>=', '<', '<=', '==', '!='],
      default: '>',
    },
  },
}
