import type { NodeTypeDefinition } from 'wayflow'

export const ragSearchNode: NodeTypeDefinition = {
  label: 'Buscar en documento',
  category: 'MercurBot',
  icon: 'search',
  ports: {
    inputs: [{ id: 'query', dataType: 'string', label: 'Consulta' }],
    outputs: [{ id: 'results', dataType: 'array', label: 'Fragmentos' }],
  },
  configSchema: {
    limit: { type: 'number', label: 'Cantidad', default: 3 },
  },
}
