import type { NodeTypeDefinition } from 'wayflow'

export const chatQueryNode: NodeTypeDefinition = {
  label: 'Consultar IA',
  category: 'MercurBot',
  icon: 'chat',
  ports: {
    inputs: [{ id: 'context', dataType: 'string', label: 'Contexto' }],
    outputs: [{ id: 'answer', dataType: 'string', label: 'Respuesta' }],
  },
  configSchema: {
    prompt: { type: 'textarea', label: 'Prompt' },
  },
}
