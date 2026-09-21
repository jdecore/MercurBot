import { useEffect, useRef, useMemo } from 'react'
import { createWorkflowEditor, BUILTIN_NODE_TYPES, type WorkflowEditor } from 'wayflow'
import { createRunSessions, createMemoryCheckpointStore } from 'wayflow/runtime'
import { createMercurRuntime, type MercurBotRuntimeContext } from './mercurRuntime'
import { pdfLoadNode } from './nodes/pdfLoad'
import { pdfExtractPageNode } from './nodes/pdfExtractPage'
import { ragSearchNode } from './nodes/ragSearch'
import { chatQueryNode } from './nodes/chatQuery'
import { outputChatNode } from './nodes/outputChat'

const NODE_TYPES = {
  ...BUILTIN_NODE_TYPES,
  pdfLoad: pdfLoadNode,
  pdfExtractPage: pdfExtractPageNode,
  ragSearch: ragSearchNode,
  chatQuery: chatQueryNode,
  outputChat: outputChatNode,
}

export function WayflowPanel({ mercur }: { mercur: MercurBotRuntimeContext }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<WorkflowEditor | null>(null)
  const mercurRef = useRef(mercur)

  useEffect(() => {
    mercurRef.current = mercur
  }, [mercur])

  const runtime = useMemo(() => {
    const rt = createMercurRuntime({
      get pdfDoc() { return mercurRef.current.pdfDoc },
      get ragClient() { return mercurRef.current.ragClient },
    })
    const sessions = createRunSessions(rt, { store: createMemoryCheckpointStore() })
    return { runtime: rt, sessions }
  }, [])

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
          const stream = runtime.sessions.stream(graph, { inputs, signal })
          let completed = 0
          const total = Object.keys(graph.nodes).length
          for await (const event of stream) {
            if (event.event === 'node_status') {
              const { nodeId, status, error } = event.data
              ed.setNodeStatus(nodeId, status)
              if (error) {
                ed.setNodeRunData(nodeId, { error })
              }
              if (status === 'complete') completed++
              if (status === 'error') {
                window.dispatchEvent(new CustomEvent('copixi:workflow-status', { detail: 'error' }))
              }
            }
            if (event.event === 'node_chunk') {
              const { nodeId, content } = event.data
              ed.setNodeRunData(nodeId, { streamedText: content })
            }
          }
          if (completed === total && total > 0) {
            window.dispatchEvent(new CustomEvent('copixi:workflow-status', { detail: 'complete' }))
          }
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
  }, [runtime.sessions])

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
        <strong>Automatización</strong>
        <span className="wayflow-panel-hint">Arrastra nodos y conéctalos</span>
      </div>
      <div ref={containerRef} className="wayflow-panel-editor" />
    </div>
  )
}
