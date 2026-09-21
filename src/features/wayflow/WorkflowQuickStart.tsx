import * as Dialog from '@radix-ui/react-dialog'
import { Icon } from '../../components/ui/Icon'

interface WorkflowQuickStartProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (preset: string) => void
}

const PRESETS = [
  { id: 'resumen', label: 'Resumen ejecutivo', icon: 'file', description: 'Extrae las primeras páginas y genera un resumen' },
  { id: 'busqueda', label: 'Buscar y responder', icon: 'search', description: 'Busca un concepto y responde con el contexto' },
  { id: 'extraccion', label: 'Extraer texto de página', icon: 'file', description: 'Extrae el texto de una página específica' },
]

export function WorkflowQuickStart({ open, onOpenChange, onSelect }: WorkflowQuickStartProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wf-quick-overlay" />
        <Dialog.Content className="wf-quick-card" aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}>
          <Dialog.Title className="wf-quick-title">Automatizaciones rápidas</Dialog.Title>
          <p className="wf-quick-sub">Elige un flujo prearmado para empezar.</p>
          <div className="wf-quick-list">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="wf-quick-item"
                onClick={() => onSelect(p.id)}
              >
                <Icon name={p.icon as any} size={18} />
                <div>
                  <strong>{p.label}</strong>
                  <p>{p.description}</p>
                </div>
              </button>
            ))}
          </div>
          <Dialog.Close className="btn btn-secondary small" style={{ marginTop: 16 }}>Cancelar</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
