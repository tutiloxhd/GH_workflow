import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import {
  EFMarkerType,
  FCanvasComponent,
  FFlowModule,
  type FCreateConnectionEvent,
  type FDeleteSelectedEvent,
  type FSelectionChangeEvent,
} from '@foblex/flow';

export interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

// Lo que el diagrama necesita de cada tarea; el editor es dueño de los datos.
export interface DiagramNode {
  readonly key: number;
  readonly code: string;
  readonly title: string;
  readonly subtitle: string;
  readonly badges: readonly string[];
  readonly position: DiagramPoint;
  readonly dependsOnKeys: readonly number[];
}

// Una dependencia: `toKey` se activa cuando se completa `fromKey`.
export interface DiagramLink {
  readonly fromKey: number;
  readonly toKey: number;
}

const inputId = (key: number) => `in-${String(key)}`;
const outputId = (key: number) => `out-${String(key)}`;
const nodeId = (key: number) => `task-${String(key)}`;
const linkId = (link: DiagramLink) => `dep-${String(link.fromKey)}-${String(link.toKey)}`;
const keyOf = (id: string | undefined): number | null => {
  const match = /^(?:in|out|task)-(\d+)$/.exec(id ?? '');
  return match ? Number(match[1]) : null;
};
const linkOf = (id: string): DiagramLink | null => {
  const match = /^dep-(\d+)-(\d+)$/.exec(id);
  return match ? { fromKey: Number(match[1]), toKey: Number(match[2]) } : null;
};

// Diagrama del flujo: cada tarea es una caja; se arrastra para moverla y se une la salida
// (derecha) de una tarea con la entrada (izquierda) de otra para crear una dependencia.
@Component({
  selector: 'app-flow-diagram',
  imports: [FFlowModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <f-flow
      fDraggable
      [fDraggableDisabled]="!isEditable()"
      (fCreateConnection)="onCreateConnection($event)"
      (fDeleteSelected)="onDeleteSelected($event)"
      (fSelectionChange)="onSelectionChange($event)"
      (fNodesRendered)="fitToScreen()"
    >
      <f-canvas fZoom>
        <f-connection-for-create fBehavior="floating" fType="bezier">
          <f-connection-marker-arrow [type]="markerEnd" />
        </f-connection-for-create>

        @for (link of links(); track linkKey(link)) {
          <f-connection
            [fConnectionId]="linkId(link)"
            [fSourceId]="outputId(link.fromKey)"
            [fTargetId]="inputId(link.toKey)"
            [fReassignDisabled]="true"
            fBehavior="fixed"
            fType="bezier"
          >
            <f-connection-marker-arrow [type]="markerEndAllStates" />
          </f-connection>
        }

        @for (node of nodes(); track node.key) {
          <div
            fNode
            fDragHandle
            class="diagram-node"
            [class.is-selected]="node.key === selectedKey()"
            [fNodeId]="nodeId(node.key)"
            [fNodePosition]="node.position"
            [fNodeDraggingDisabled]="!isEditable()"
            (fNodePositionChange)="moved.emit({ key: node.key, position: $event })"
          >
            <div
              fConnector
              fConnectorType="target"
              fConnectorMultiple
              class="connector connector-in"
              [fConnectorId]="inputId(node.key)"
              [fConnectorDisabled]="!isEditable()"
              title="Entrada: se activa cuando se completan las tareas que llegan aquí"
            ></div>
            <strong class="node-title">{{ node.title }}</strong>
            <span class="node-subtitle">{{ node.subtitle }}</span>
            @if (node.badges.length > 0) {
              <span class="node-badges">
                @for (badge of node.badges; track badge) {
                  <span class="node-badge">{{ badge }}</span>
                }
              </span>
            }
            <div
              fConnector
              fConnectorType="source"
              fConnectorMultiple
              class="connector connector-out"
              [fConnectorId]="outputId(node.key)"
              [fConnectorDisabled]="!isEditable()"
              title="Salida: arrastra hasta otra tarea para que dependa de esta"
            ></div>
          </div>
        }
      </f-canvas>
    </f-flow>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    f-flow {
      display: block;
      height: min(70vh, 720px);
      min-height: 420px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background-color: var(--ff-color-surface-canvas);
      background-image: radial-gradient(var(--ff-color-grid) 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .diagram-node {
      display: grid;
      gap: 4px;
      width: 220px;
      padding: 12px 16px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--surface);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      cursor: grab;
      font-size: 0.8125rem;
    }
    .diagram-node.is-selected {
      border-color: var(--ff-color-accent);
      box-shadow: 0 0 0 3px var(--ff-color-selection-fill);
    }
    .node-title {
      line-height: 1.25;
    }
    .node-subtitle {
      color: var(--muted);
      font-size: 0.75rem;
    }
    .node-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .node-badge {
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--ff-color-surface-accent-soft);
      font-size: 0.6875rem;
    }
    .connector {
      position: absolute;
      top: 50%;
      width: 14px;
      height: 14px;
      margin-top: -7px;
      border: 2px solid var(--surface);
      border-radius: 50%;
      background: var(--ff-color-connection);
      cursor: crosshair;
    }
    .connector-in {
      left: -8px;
    }
    .connector-out {
      right: -8px;
      background: var(--ff-color-accent);
    }
    @media (max-width: 760px) {
      f-flow {
        height: min(55dvh, 520px);
        min-height: 300px;
      }
    }
  `,
})
export class FlowDiagram {
  private readonly canvas = viewChild(FCanvasComponent);

  readonly nodes = input.required<readonly DiagramNode[]>();
  readonly isEditable = input(false);
  readonly selectedKey = input<number | null>(null);

  readonly selected = output<number | null>();
  readonly moved = output<{ key: number; position: DiagramPoint }>();
  readonly linked = output<DiagramLink>();
  readonly unlinked = output<readonly DiagramLink[]>();

  protected readonly markerEnd = EFMarkerType.END;
  protected readonly markerEndAllStates = EFMarkerType.END_ALL_STATES;
  protected readonly inputId = inputId;
  protected readonly outputId = outputId;
  protected readonly nodeId = nodeId;
  protected readonly linkId = linkId;
  protected readonly linkKey = linkId;

  protected links(): DiagramLink[] {
    return this.nodes().flatMap((node) =>
      node.dependsOnKeys.map((fromKey) => ({ fromKey, toKey: node.key })),
    );
  }

  fitToScreen(): void {
    this.canvas()?.fitToScreen({ x: 40, y: 40 }, false, false, 1);
  }

  protected onCreateConnection(event: FCreateConnectionEvent): void {
    const fromKey = keyOf(event.sourceId);
    const toKey = keyOf(event.targetId);
    if (fromKey === null || toKey === null) return;
    this.linked.emit({ fromKey, toKey });
  }

  protected onDeleteSelected(event: FDeleteSelectedEvent): void {
    if (!this.isEditable()) return;
    const links = event.connectionIds
      .map(linkOf)
      .filter((link): link is DiagramLink => link !== null);
    if (links.length > 0) this.unlinked.emit(links);
  }

  protected onSelectionChange(event: FSelectionChangeEvent): void {
    const [first] = event.nodeIds;
    this.selected.emit(first === undefined ? null : keyOf(first));
  }
}
