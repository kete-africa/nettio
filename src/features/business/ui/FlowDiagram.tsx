import { labelClassName } from '@kete/design';
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cx } from '@/lib/fields';
import { COLUMN, NODE, type Flow, type FlowNode } from '../domain/flow';

// The diagram of the laundry (docs/decisions/0002): what `businessFlow` computed, painted with
// the semantic tokens of @kete/design. Nothing is decided here; touching a box opens its setting.
// It fits the width it is given and takes the height it needs: the page scrolls, the picture does
// not move under the finger.

type BoxNode = Node<{ node: FlowNode }, 'box'>;

const looks: Record<FlowNode['kind'], string> = {
  title: '',
  site: 'rounded-box border border-line-strong bg-surface',
  service: 'rounded-box border border-line-selected bg-surface-selected font-semibold',
  step: 'rounded-control border border-line bg-surface',
  direct: 'rounded-control border border-dashed border-line text-fg-muted',
  state: 'rounded-pill border border-line-strong bg-surface-raised',
};

const hidden = '!size-px !min-h-0 !min-w-0 !border-0 !bg-transparent';

function Box({ data }: NodeProps<BoxNode>) {
  const { node } = data;
  if (node.kind === 'title') {
    return <div className={cx(labelClassName, 'whitespace-nowrap')}>{node.label}</div>;
  }
  return (
    <div
      style={{ width: NODE.width, height: NODE.height }}
      className={cx(
        'flex flex-col justify-center px-3 text-body-sm leading-tight text-fg',
        looks[node.kind],
        node.muted && 'opacity-60',
        Boolean(node.target) && 'cursor-pointer hover:bg-surface-hover',
      )}
    >
      <Handle id="left" type="target" position={Position.Left} className={hidden} />
      <Handle id="top" type="target" position={Position.Top} className={hidden} />
      <span className={node.detail ? 'truncate' : 'line-clamp-2'}>{node.label}</span>
      {node.detail && <span className="truncate text-[11px] text-fg-muted">{node.detail}</span>}
      <Handle id="right" type="source" position={Position.Right} className={hidden} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={hidden} />
    </div>
  );
}

const nodeTypes = { box: Box };

// React Flow's own variables, set to the design's tokens: it follows the light and dark modes.
const tokens = {
  '--xy-background-color': 'transparent',
  '--xy-edge-stroke': 'var(--color-fg-muted)',
  '--xy-edge-label-color': 'var(--color-fg-muted)',
  '--xy-edge-label-background-color': 'var(--color-canvas)',
  '--xy-attribution-background-color': 'transparent',
} as CSSProperties;

const PADDING = 16;
/** Under this zoom the words are too small to read: a route wraps onto the next row instead. */
const SMALLEST = 0.8;

export function FlowDiagram({
  flowFor,
  label,
  onOpen,
}: {
  /** The diagram for a number of boxes side by side (`businessFlow`'s `perRow`). */
  flowFor: (perRow: number) => Flow;
  /** What the diagram is, for assistive technology; its text equivalent sits beside it. */
  label: string;
  onOpen?: (target: NonNullable<FlowNode['target']>) => void;
}) {
  // The canvas is laid out for the width it gets: it is drawn once the page runs in the browser.
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const room = Math.max(0, width - 2 * PADDING);
  const perRow = Math.min(12, Math.max(2, Math.floor((room + 30) / (COLUMN * SMALLEST))));
  const flow = useMemo(() => flowFor(perRow), [flowFor, perRow]);
  const zoom = flow.width > 0 ? Math.min(1, room / flow.width) : 1;

  const nodes = useMemo<BoxNode[]>(
    () =>
      flow.nodes.map((node) => ({
        id: node.id,
        type: 'box',
        position: { x: node.x, y: node.y },
        data: { node },
        draggable: false,
        connectable: false,
        selectable: false,
        // The rows under the diagram are its keyboard way in.
        focusable: false,
      })),
    [flow],
  );
  const edges = useMemo<Edge[]>(
    () =>
      flow.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        sourceHandle: edge.fromSide,
        targetHandle: edge.toSide,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-fg-muted)' },
        ...(edge.label ? { label: edge.label } : {}),
        ...(edge.aside ? { style: { strokeDasharray: '4 4' } } : {}),
      })),
    [flow],
  );
  return (
    <div
      ref={frame}
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-box border border-line bg-canvas"
      style={{ ...tokens, height: width > 0 ? flow.height * zoom + 2 * PADDING : 320 }}
    >
      {width > 0 && (
        <ReactFlow
          // Laid out again for another width: the viewport is set once per layout.
          key={`${perRow}-${Math.round(zoom * 100)}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          defaultViewport={{ x: PADDING, y: PADDING, zoom }}
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          onNodeClick={(_event, node) => {
            const target = (node as BoxNode).data.node.target;
            if (target) onOpen?.(target);
          }}
        />
      )}
    </div>
  );
}
