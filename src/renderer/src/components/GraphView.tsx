import { useMemo, useState } from 'react'
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force'
import type { GraphData } from '../lib/graph'

interface Props {
  graph: GraphData
  onOpen: (absolutePath: string) => void
  onClose: () => void
}

interface SimNode {
  id: string
  title: string
  degree: number
  x: number
  y: number
}

const W = 1200
const H = 820

export function GraphView({ graph, onOpen, onClose }: Props): React.JSX.Element {
  const [hover, setHover] = useState<string | null>(null)

  const layout = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = graph.nodes.map((n) => ({ ...n }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const links: any[] = graph.links.map((l) => ({ source: l.source, target: l.target }))
    if (nodes.length === 0)
      return {
        nodes: [] as SimNode[],
        links: [] as { sx: number; sy: number; tx: number; ty: number }[]
      }
    const sim = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-160))
      .force(
        'link',
        forceLink(links)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .id((d: any) => d.id)
          .distance(70)
          .strength(0.5)
      )
      .force('center', forceCenter(W / 2, H / 2))
      .force('collide', forceCollide(16))
      .stop()
    for (let i = 0; i < 320; i++) sim.tick()
    const simNodes = nodes as SimNode[]
    const edges = links.map((l) => ({
      sx: l.source.x,
      sy: l.source.y,
      tx: l.target.x,
      ty: l.target.y
    }))
    return { nodes: simNodes, links: edges }
  }, [graph])

  const viewBox = useMemo(() => {
    if (layout.nodes.length === 0) return `0 0 ${W} ${H}`
    const xs = layout.nodes.map((n) => n.x)
    const ys = layout.nodes.map((n) => n.y)
    const pad = 60
    const minX = Math.min(...xs) - pad
    const minY = Math.min(...ys) - pad
    const w = Math.max(...xs) - minX + pad
    const h = Math.max(...ys) - minY + pad
    return `${minX} ${minY} ${w} ${h}`
  }, [layout])

  return (
    <div className="graph-overlay">
      <div className="graph-bar">
        <span>
          Graph · {graph.nodes.length} notes · {graph.links.length} links
        </span>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {graph.nodes.length === 0 ? (
        <div className="loading">No notes to graph.</div>
      ) : (
        <svg className="graph-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <g stroke="var(--border)" strokeWidth={1}>
            {layout.links.map((e, i) => (
              <line key={i} x1={e.sx} y1={e.sy} x2={e.tx} y2={e.ty} />
            ))}
          </g>
          <g>
            {layout.nodes.map((n) => {
              const r = 5 + Math.min(12, n.degree * 2)
              const active = hover === n.id
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  className="graph-node"
                  onClick={() => onOpen(n.id)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle
                    r={r}
                    fill={active ? 'var(--accent)' : 'var(--accent-soft)'}
                    stroke="var(--accent)"
                  />
                  <text x={r + 4} y={4} fontSize={13} fill="var(--fg)">
                    {n.title}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      )}
    </div>
  )
}
