import type { NodeTypeDefinition } from 'wayflow'

export const outputChatNode: NodeTypeDefinition = {
  label: 'Enviar al chat',
  category: 'MercurBot',
  icon: 'send',
  ports: {
    inputs: [{ id: 'text', dataType: 'string', label: 'Texto' }],
    outputs: [],
  },
  configSchema: {},
}
