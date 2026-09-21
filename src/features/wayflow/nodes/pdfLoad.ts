import type { NodeTypeDefinition } from 'wayflow'

export const pdfLoadNode: NodeTypeDefinition = {
  label: 'Cargar PDF',
  category: 'MercurBot',
  icon: 'upload',
  ports: {
    inputs: [],
    outputs: [{ id: 'pdf', dataType: 'object', label: 'PDF' }],
  },
  configSchema: {},
}
