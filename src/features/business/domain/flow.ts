import type { Site } from '../business.record';
import { processes } from './sites';

// The diagram of a laundry, computed from its settings (constitution IV): its sites and which
// counter sends to which plant, each service with its route step by step, and the life of a
// deposit. A pure function: the same settings always draw the same diagram, and a change redraws
// it. The view only paints what this returns.
//
// Three sections, one under the other, so that the diagram fits the width of the screen and takes
// the height it needs: a phone reads it by scrolling the page, never by panning a tiny picture.

export type FlowNodeKind = 'title' | 'site' | 'service' | 'step' | 'direct' | 'state';

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  label: string;
  /** A second line: the kind of a site, how a service is priced. */
  detail?: string;
  x: number;
  y: number;
  /** What the node opens when touched. */
  target?: { type: 'site' | 'service' | 'step'; id: string };
  /** A way out of the usual path: drawn muted. */
  muted?: boolean;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  /** Where the link leaves and enters: along a row, or down to the next one. */
  fromSide: 'right' | 'bottom';
  toSide: 'left' | 'top';
  label?: string;
  /** A way out of the usual path (cancellation): drawn dashed. */
  aside?: boolean;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
}

export interface FlowService {
  serviceId: string;
  name: string;
  pricing: 'per_piece' | 'per_kg';
  nature: 'workshop' | 'counter_only' | 'logistics';
  active: boolean;
  stepIds: string[];
}

export interface FlowWords {
  sites: string;
  routes: string;
  life: string;
  siteKinds: Record<Site['kind'], string>;
  pricings: Record<FlowService['pricing'], string>;
  natures: Record<FlowService['nature'], string>;
  sendsTo: string;
  direct: string;
  states: Record<'received' | 'in_progress' | 'ready' | 'collected' | 'cancelled', string>;
}

/** The size of a box, and the grid the boxes sit on. */
export const NODE = { width: 150, height: 52 } as const;
/** From one box to the next, along a row. */
export const COLUMN = NODE.width + 30;
const ROW = NODE.height + 24;
const TITLE = 34;
const SECTION = 36;

export function businessFlow(input: {
  sites: Site[];
  services: FlowService[];
  steps: { stepId: string; name: string }[];
  words: FlowWords;
  /**
   * How many boxes fit side by side: 2 on a phone (a route wraps onto the next row), enough for
   * the longest route on a wide screen.
   */
  perRow?: number;
}): Flow {
  const { words } = input;
  const perRow = Math.max(2, input.perRow ?? 9);
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let columns = 2;
  let y = 0;

  const title = (id: string, label: string) => {
    nodes.push({ id, kind: 'title', label, x: 0, y });
    y += TITLE;
  };

  // 1. The sites: counters on the left, the sites that process beside them.
  title('title-sites', words.sites);
  const sites = input.sites.filter((site) => site.active);
  const plants = sites.filter((site) => processes(site.kind));
  const counters = sites.filter((site) => !processes(site.kind));
  // With no counter apart, the sites that process take the first column.
  const plantColumn = counters.length > 0 ? 1 : 0;
  const plantOf = (site: Site) => plants.find((plant) => plant.siteId === site.plantSiteId);
  const place = (site: Site, column: number, row: number) =>
    nodes.push({
      id: `site-${site.siteId}`,
      kind: 'site',
      label: `${site.name} (${site.code})`,
      // A counter says where its laundry goes; the link shows it too.
      detail: plantOf(site)
        ? `${words.sendsTo} ${plantOf(site)?.name}`
        : words.siteKinds[site.kind],
      x: column * COLUMN,
      y: y + row * ROW,
      target: { type: 'site', id: site.siteId },
    });
  // A counter sits on the row of its plant when it can: the link is a straight line.
  counters.forEach((site, row) => place(site, 0, row));
  plants.forEach((site, row) => place(site, plantColumn, row));
  for (const counter of counters) {
    if (plantOf(counter)) {
      edges.push({
        id: `sends-${counter.siteId}`,
        from: `site-${counter.siteId}`,
        to: `site-${counter.plantSiteId}`,
        fromSide: 'right',
        toSide: 'left',
      });
    }
  }
  y += Math.max(counters.length, plants.length, 1) * ROW + SECTION;

  // 2. The routes: one lane per service — the service, then its steps in order, wrapping.
  title('title-routes', words.routes);
  const names = new Map(input.steps.map((step) => [step.stepId, step.name]));
  for (const service of input.services.filter((s) => s.active)) {
    const lane = `service-${service.serviceId}`;
    const route = service.stepIds.filter((stepId) => names.has(stepId));
    const boxes: Omit<FlowNode, 'x' | 'y'>[] = [
      {
        id: lane,
        kind: 'service',
        label: service.name,
        detail:
          service.nature === 'workshop'
            ? words.pricings[service.pricing]
            : words.natures[service.nature],
        target: { type: 'service', id: service.serviceId },
      },
      ...(route.length === 0
        ? [{ id: `${lane}-direct`, kind: 'direct' as const, label: words.direct }]
        : route.map((stepId, index) => ({
            id: `${lane}-step-${index}`,
            kind: 'step' as const,
            label: names.get(stepId) ?? '',
            target: { type: 'step' as const, id: stepId },
          }))),
    ];
    boxes.forEach((box, index) => {
      const column = index % perRow;
      const row = Math.floor(index / perRow);
      nodes.push({ ...box, x: column * COLUMN, y: y + row * ROW });
      columns = Math.max(columns, column + 1);
      const previous = boxes[index - 1];
      if (previous) {
        // The last box of a row hands over to the first of the next one, downwards.
        const wraps = column === 0;
        edges.push({
          id: `${box.id}-in`,
          from: previous.id,
          to: box.id,
          fromSide: wraps ? 'bottom' : 'right',
          toSide: wraps ? 'top' : 'left',
        });
      }
    });
    y += Math.ceil(boxes.length / perRow) * ROW + 12;
  }
  y += SECTION - 12;

  // 3. The life of a deposit: its usual path, and its way out.
  title('title-life', words.life);
  const path = ['received', 'in_progress', 'ready', 'collected'] as const;
  // On a narrow screen the path goes down, and the way out sits beside it.
  const down = perRow < path.length;
  path.forEach((state, index) => {
    nodes.push({
      id: `state-${state}`,
      kind: 'state',
      label: words.states[state],
      x: down ? 0 : index * COLUMN,
      y: down ? y + index * ROW : y,
    });
    const previous = path[index - 1];
    if (previous) {
      edges.push({
        id: `life-${state}`,
        from: `state-${previous}`,
        to: `state-${state}`,
        fromSide: down ? 'bottom' : 'right',
        toSide: down ? 'top' : 'left',
      });
    }
  });
  nodes.push({
    id: 'state-cancelled',
    kind: 'state',
    label: words.states.cancelled,
    x: COLUMN,
    y: y + ROW,
    muted: true,
  });
  edges.push(
    {
      id: 'life-cancel-received',
      from: 'state-received',
      to: 'state-cancelled',
      fromSide: down ? 'right' : 'bottom',
      toSide: down ? 'top' : 'left',
      aside: true,
    },
    {
      id: 'life-cancel-progress',
      from: 'state-in_progress',
      to: 'state-cancelled',
      fromSide: down ? 'right' : 'bottom',
      toSide: down ? 'left' : 'top',
      aside: true,
    },
  );
  if (!down) columns = Math.max(columns, path.length);
  y += (down ? path.length : 2) * ROW;

  return {
    nodes,
    edges,
    width: (columns - 1) * COLUMN + NODE.width,
    height: y - (ROW - NODE.height),
  };
}
