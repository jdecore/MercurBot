import type { NodeTypeDefinition } from 'wayflow'

export const pdfExtractPageNode: NodeTypeDefinition = {
  label: 'Extraer página',
  category: 'MercurBot',
  icon: 'file',
  ports: {
    inputs: [{ id: 'pdf', dataType: 'object', label: 'PDF' }],
    outputs: [{ id: 'text', dataType: 'string', label: 'Texto' }],
  },
  configSchema: {
    page: { type: 'number', label: 'Página' },
  },
}
