import { useRef, useCallback, useEffect, useState } from 'react'
import { createWorkflowEditor, BUILTIN_NODE_TYPES, type WorkflowEditor } from 'wayflow'
import { createRunSessions, createMemoryCheckpointStore } from 'wayflow/runtime'
import { createMercurRuntime, type MercurBotRuntimeContext } from './mercurRuntime'
import { pdfLoadNode } from './nodes/pdfLoad'
import { pdfExtractPageNode } from './nodes/pdfExtractPage'
import { ragSearchNode } from './nodes/ragSearch'
import { chatQueryNode } from './nodes/chatQuery'
import { outputChatNode } from './nodes/outputChat'
import { conditionPageNode } from './nodes/conditionPage'
import { loopPagesNode } from './nodes/loopPages'

const NODE_TYPES = {
  ...BUILTIN_NODE_TYPES,
  pdfLoad: pdfLoadNode,
  pdfExtractPage: pdfExtractPageNode,
  ragSearch: ragSearchNode,
  chatQuery: chatQueryNode,
  outputChat: outputChatNode,
  conditionPage: conditionPageNode,
  loopPages: loopPagesNode,
}

export function WayflowPanel({ mercur }: { mercur: MercurBotRuntimeContext }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<WorkflowEditor | null>(null)
  const mercurRef = useRef(mercur)
  const runtimeRef = useRef<ReturnType<typeof createMercurRuntime> | null>(null)
  const sessionsRef = useRef<ReturnType<typeof createRunSessions> | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle')

  useEffect(() => {
    const handler = (e: Event) => {
      const s = (e as CustomEvent<string>).detail
      if (s === 'complete' || s === 'error') setStatus(s)
    }
    window.addEventListener('copixi:workflow-status', handler as EventListener)
    return () => window.removeEventListener('copixi:workflow-status', handler as EventListener)
  }, [])

  useEffect(() => {
    mercurRef.current = mercur
    if (!runtimeRef.current) {
      runtimeRef.current = createMercurRuntime({
        get pdfDoc() { return mercurRef.current.pdfDoc },
        get ragClient() { return mercurRef.current.ragClient },
      })
      sessionsRef.current = createRunSessions(runtimeRef.current, { store: createMemoryCheckpointStore() })
    }
  }, [mercur])

  const loadPreset = useCallback((preset: string) => {
    const ed = editorRef.current
    if (!ed) return
    ed.clearExecutionState()
    const created: Record<string, string> = {}
    let y = 0
    const add = (type: string, data: Record<string, unknown>) => {
      const label = `${type}-${Object.keys(created).length + 1}`
      const node = ed.addNode({ type, position: { x: 0, y: y }, data })
      created[label] = node.id
      y += 180
      return label
    }
    const link = (from: string, fromPort: string, to: string, toPort: string) => {
      ed.addEdge({ id: `${created[from]}-${fromPort}`, sourceNodeId: created[from], sourcePortId: fromPort, targetNodeId: created[to], targetPortId: toPort })
    }
    if (preset === 'resumen') {
      const a = add('pdfLoad', {})
      const b = add('pdfExtractPage', { page: 1 })
      const c = add('pdfExtractPage', { page: 2 })
      const d = add('chatQuery', { prompt: 'Resume el contenido de estas páginas en 3 puntos clave.' })
      const e = add('outputChat', {})
      link(a, 'pdf', b, 'pdf')
      link(b, 'text', d, 'context')
      link(c, 'text', d, 'context')
      link(d, 'answer', e, 'text')
    } else if (preset === 'busqueda') {
      const a = add('ragSearch', { limit: 3 })
      const b = add('chatQuery', { prompt: 'Responde la pregunta usando el contexto encontrado.' })
      const c = add('outputChat', {})
      link(a, 'results', b, 'context')
      link(b, 'answer', c, 'text')
    } else if (preset === 'extraccion') {
      const a = add('pdfExtractPage', { page: 1 })
      const b = add('outputChat', {})
      link(a, 'text', b, 'text')
    }
  }, [])

  useEffect(() => {
    const handler = (ev: Event) => {
      const preset = (ev as CustomEvent<string>).detail
      if (!preset) return
      loadPreset(preset)
    }
    window.addEventListener('copixi:run-workflow', handler as EventListener)
    return () => window.removeEventListener('copixi:run-workflow', handler as EventListener)
  }, [loadPreset])

  useEffect(() => {
    if (!containerRef.current) return
    const editor = createWorkflowEditor(containerRef.current, {
      mode: 'edit',
      theme: 'auto',
      nodeTypes: NODE_TYPES,
      persistence: undefined,
      debug: false,
      onRun: async ({ inputs, signal }) => {
        const ed = editorRef.current
        if (!ed) return
        ed.clearExecutionState()
        const graph = ed.getGraph()
        try {
          const stream = sessionsRef.current!.stream(graph, { inputs, signal })
          let completed = 0
          const total = Object.keys(graph.nodes).length
          for await (const event of stream) {
            if (event.event === 'node_status') {
              const { nodeId, status, error } = event.data
              ed.setNodeStatus(nodeId, status)
              if (error) ed.setNodeRunData(nodeId, { error })
              if (status === 'complete') completed++
              if (status === 'error') window.dispatchEvent(new CustomEvent('copixi:workflow-status', { detail: 'error' }))
            }
            if (event.event === 'node_chunk') {
              const { nodeId, content } = event.data
              ed.setNodeRunData(nodeId, { streamedText: content })
            }
          }
          if (completed === total && total > 0) window.dispatchEvent(new CustomEvent('copixi:workflow-status', { detail: 'complete' }))
        } catch {
          window.dispatchEvent(new CustomEvent('copixi:workflow-status', { detail: 'error' }))
        }
      },
    })
    editorRef.current = editor
    return () => {
      editor.destroy?.()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const root = containerRef.current?.closest('.doc-wayflow-col')
    if (!root) return
    const el = root as HTMLElement
    el.style.setProperty('--wf-accent', 'var(--color-primary)')
    el.style.setProperty('--wf-background', 'var(--color-surface)')
    el.style.setProperty('--wf-surface', 'var(--color-card)')
    el.style.setProperty('--wf-text', 'var(--color-foreground)')
    el.style.setProperty('--wf-border', 'var(--color-border)')
  })

  return (
    <div className="doc-wayflow-col">
      <div className="wayflow-panel-head">
        <div>
          <strong>Automatización</strong>
          <span className="wayflow-panel-hint">
            {!mercur.pdfDoc
              ? 'Cargá un PDF para empezar'
              : status === 'running'
                ? 'Ejecutando…'
                : 'Arrastra nodos y conéctalos'}
          </span>
        </div>
        <div className="wayflow-panel-actions">
          {status === 'running' && <span className="wayflow-status-dot" aria-label="Ejecutando" />}
          <button
            type="button"
            className="btn btn-secondary small"
            onClick={() => {
              editorRef.current?.clearExecutionState()
              setStatus('idle')
            }}
          >
            Limpiar
          </button>
        </div>
      </div>
      {!mercur.pdfDoc ? (
        <div className="wayflow-empty" role="status">
          <p>Cargá un PDF para usar automatizaciones.</p>
        </div>
      ) : (
        <div ref={containerRef} className="wayflow-panel-editor" />
      )}
    </div>
  )
}
