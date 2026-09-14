import type { ChartSpec } from '../../lib/chartJson'

/**
 * ChartCard nativo (Fase C): dibuja el chart-JSON validado con SVG propio,
 * sin librerías. Barras + línea, ejes, etiquetas y citas de origen.
 * Colores vía tokens papel/tinta (válido en modo oscuro).
 */

const W = 560
const H = 340
const PAD = { l: 58, r: 14, t: 14, b: 66 }

/** Redondeo "bonito" del máximo del eje Y (1/2/2.5/5 × 10^k). */
function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = 10 ** exp
  const f = v / base
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nf * base
}

const fmtCompact = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 })
const fmtFull = new Intl.NumberFormat('es', { maximumFractionDigits: 2 })

function shortLabel(s: string): string {
  return s.length > 12 ? `${s.slice(0, 12)}…` : s
}

export default function ChartCard({ spec }: { spec: ChartSpec }) {
  const values = spec.data.map((d) => d.value)
  const lo = Math.min(0, ...values)
  const hi = niceMax(Math.max(...values, 0.0001))
  const span = hi - lo || 1
  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  const y = (v: number) => PAD.t + plotH - ((v - lo) / span) * plotH
  const zeroY = y(0)
  const n = spec.data.length
  const slot = plotW / n
  const barW = Math.min(46, Math.max(10, slot * 0.58))
  const x = (i: number) => PAD.l + slot * i + slot / 2
  const ticks = [0, 1, 2, 3, 4].map((t) => lo + (span * t) / 4)
  const pages = [...new Set(spec.data.map((d) => d.sourcePage))].sort((a, b) => a - b)
  const ariaSummary = `${spec.title}: ${spec.data.map((d) => `${d.label} ${fmtFull.format(d.value)}`).join(', ')}${spec.unit ? ` (${spec.unit})` : ''}`

  const gotoPage = (page: number) => {
    window.dispatchEvent(new CustomEvent('copixi:goto-page', { detail: { page } }))
  }

  return (
    <figure className="chart-card" aria-label={`Gráfica: ${spec.title}`}>
      <figcaption className="chart-title">
        {spec.title}
        {spec.unit && <span className="chart-unit"> · {spec.unit}</span>}
      </figcaption>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaSummary}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="chart-tick">
              {fmtCompact.format(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} className="chart-axis" />
        {spec.chartType === 'bar' ? (
          <g>
            {spec.data.map((d, i) => {
              const yTop = Math.min(y(d.value), zeroY)
              const h = Math.abs(zeroY - y(d.value))
              return (
                <g key={i}>
                  <rect
                    x={x(i) - barW / 2}
                    y={yTop}
                    width={barW}
                    height={Math.max(h, 2)}
                    rx={3}
                    className="chart-bar"
                  >
                    <title>{`${d.label}: ${fmtFull.format(d.value)}`}</title>
                  </rect>
                  <text x={x(i)} y={yTop - 6} textAnchor="middle" className="chart-value">
                    {fmtCompact.format(d.value)}
                  </text>
                </g>
              )
            })}
          </g>
        ) : (
          <g>
            <polyline
              points={spec.data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')}
              className="chart-line-stroke"
              fill="none"
            />
            {spec.data.map((d, i) => (
              <g key={i}>
                <circle cx={x(i)} cy={y(d.value)} r={4.5} className="chart-dot">
                  <title>{`${d.label}: ${fmtFull.format(d.value)}`}</title>
                </circle>
                <text x={x(i)} y={y(d.value) - 10} textAnchor="middle" className="chart-value">
                  {fmtCompact.format(d.value)}
                </text>
              </g>
            ))}
          </g>
        )}
        {spec.data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - PAD.b + 18}
            textAnchor="end"
            transform={`rotate(-28 ${x(i)} ${H - PAD.b + 18})`}
            className="chart-label"
          >
            {shortLabel(d.label)}
            <title>{d.label}</title>
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{ariaSummary}</caption>
        <tbody>
          {spec.data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{fmtFull.format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="chart-sources" aria-label="Páginas de origen de los datos">
        <span className="chart-sources-label">Datos de:</span>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className="citation-badge citation-inline"
            onClick={() => gotoPage(p)}
            aria-label={`Ver página ${p} en el visor`}
            title={`Ver página ${p} en el visor`}
          >
            [Pág. {p}]
          </button>
        ))}
      </div>
    </figure>
  )
}
