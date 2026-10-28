"use client";

/**
 * Generic pick-and-drag mechanic: a picker list (library, roster) whose rows
 * toggle on tap and, on desktop, can be dragged into an ordered target list at
 * a position; target rows can be reordered by their handle.
 *
 * To reuse it for another item type:
 *  1. Wrap everything (the drawer and its aside) in one <PickDndProvider>.
 *  2. Render the target list with <PickTarget targetId ids onChange> and wrap
 *     each row in <TargetRow> (pass reorder={false} for a list with no
 *     reordering, e.g. a lineup: rows then have no handle).
 *  3. Render picker rows with <PickerRow>, passing the same targetId.
 * Item ids are plain strings; `onChange` receives the new full order. Rows
 * supply their own `overlay` node, so the provider knows nothing about songs.
 */

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TargetChange {
  /** Set when the change inserted this id from a picker. */
  added?: string;
}

interface TargetRegistration {
  ids: string[];
  onChange: (ids: string[], change: TargetChange) => void;
}

interface DragData {
  type: "pick" | "item" | "container";
  targetId: string;
  itemId?: string;
  /** Position of a target row in its list. */
  index?: number;
  overlay?: ReactNode;
}

interface ActiveDrag {
  type: "pick" | "item";
  targetId: string;
  itemId: string;
  overlay: ReactNode;
}

interface PickDndState {
  active: ActiveDrag | null;
  /** Index in the target where a picked item would land; null when not over it. */
  insertAt: number | null;
  register: (targetId: string, reg: TargetRegistration) => void;
}

const PickDndContext = createContext<PickDndState | null>(null);

function usePickDnd(): PickDndState {
  const ctx = useContext(PickDndContext);
  if (!ctx) throw new Error("Pick/target components need a <PickDndProvider>");
  return ctx;
}

const sortId = (targetId: string, itemId: string) =>
  `sort:${targetId}:${itemId}`;

const collision: CollisionDetection = (args) => {
  const activeData = args.active.data.current as DragData | undefined;
  if (!activeData) return [];
  const mine = args.droppableContainers.filter(
    (c) =>
      (c.data.current as DragData | undefined)?.targetId ===
      activeData.targetId,
  );
  const items = mine.filter(
    (c) => (c.data.current as DragData | undefined)?.type === "item",
  );
  if (activeData.type === "item") {
    return closestCenter({ ...args, droppableContainers: items });
  }
  const container = mine.find(
    (c) => (c.data.current as DragData | undefined)?.type === "container",
  );
  const y = args.pointerCoordinates?.y;
  if (!container || y === undefined) return [];
  if (
    pointerWithin({ ...args, droppableContainers: [container] }).length === 0
  ) {
    return [];
  }
  let best: { id: UniqueIdentifier; dist: number; index: number } | null = null;
  for (const c of items) {
    const rect = args.droppableRects.get(c.id);
    if (!rect) continue;
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(y - mid);
    if (!best || dist < best.dist) {
      const index = (c.data.current as DragData).index ?? 0;
      best = { id: c.id, dist, index: index + (y > mid ? 1 : 0) };
    }
  }
  if (!best) return [{ id: container.id, data: { insertAt: 0 } }];
  return [{ id: best.id, data: { insertAt: best.index } }];
};

const EDGE_BAND = 0.05;
const EDGE_DWELL_MS = 200;

function scrollParent(node: EventTarget | null): Element | null {
  let el = node instanceof Element ? node.parentElement : null;
  while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
    el = el.parentElement;
  }
  return el;
}

/** One DndContext for a drawer and its aside; shared by every picker and target inside. */
export function PickDndProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, TargetRegistration>());
  const scroller = useRef<Element | null>(null);
  const dwell = useRef<number | null>(null);
  const clearDwell = () => {
    if (dwell.current !== null) window.clearTimeout(dwell.current);
    dwell.current = null;
  };
  const [scrollEdge, setScrollEdge] = useState(true);
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const register = useCallback((targetId: string, reg: TargetRegistration) => {
    registry.current.set(targetId, reg);
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    scroller.current = scrollParent(e.activatorEvent.target);
    // Pointer drags wait for the edge band; keyboard drags always scroll.
    setScrollEdge(!("clientX" in e.activatorEvent));
    const data = e.active.data.current as DragData | undefined;
    if (!data || data.type === "container" || !data.itemId) return;
    setActive({
      type: data.type,
      targetId: data.targetId,
      itemId: data.itemId,
      overlay: data.overlay,
    });
  };

  // Also runs on over changes so a late droppable measurement still updates the gap.
  const onDragMove = (e: DragMoveEvent | DragOverEvent) => {
    trackPointer(e);
    const data = e.active.data.current as DragData | undefined;
    if (data?.type !== "pick") return;
    const next =
      (e.collisions?.[0]?.data?.insertAt as number | undefined) ?? null;
    setInsertAt((prev) => (prev === next ? prev : next));
  };

  // Auto-scroll starts after the pointer dwells in the top or bottom edge band
  // of the list's scroll container, so passing over a clipped row or the footer
  // does not scroll the list out from under the pointer.
  const trackPointer = (e: DragMoveEvent | DragOverEvent) => {
    const a = e.activatorEvent as Partial<MouseEvent & TouchEvent>;
    const src = a.touches?.[0] ?? a;
    const box = scroller.current?.getBoundingClientRect();
    if (!box || src.clientX === undefined || src.clientY === undefined) return;
    const y = src.clientY + e.delta.y;
    const band = box.height * EDGE_BAND;
    const inBand =
      (y >= box.top && y <= box.top + band) ||
      (y >= box.bottom - band && y <= box.bottom);
    if (inBand && dwell.current === null && !scrollEdge) {
      dwell.current = window.setTimeout(
        () => setScrollEdge(true),
        EDGE_DWELL_MS,
      );
    } else if (!inBand) {
      clearDwell();
      setScrollEdge(false);
    }
  };

  const finish = () => {
    scroller.current = null;
    clearDwell();
    setScrollEdge(true);
    setActive(null);
    setInsertAt(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as DragData | undefined;
    const reg = data ? registry.current.get(data.targetId) : undefined;
    if (data && reg && data.itemId) {
      if (data.type === "pick" && insertAt !== null) {
        if (!reg.ids.includes(data.itemId)) {
          const next = [...reg.ids];
          next.splice(insertAt, 0, data.itemId);
          reg.onChange(next, { added: data.itemId });
        }
      } else if (data.type === "item" && e.over) {
        const over = e.over.data.current as DragData | undefined;
        const from = reg.ids.indexOf(data.itemId);
        const to = over?.itemId ? reg.ids.indexOf(over.itemId) : -1;
        if (from >= 0 && to >= 0 && from !== to) {
          reg.onChange(arrayMove(reg.ids, from, to), {});
        }
      }
    }
    finish();
  };

  const value = useMemo(
    () => ({ active, insertAt, register }),
    [active, insertAt, register],
  );
  // Picks use a thin edge zone so a row near the list's edge is not scrolled away.
  const autoScroll =
    active?.type === "pick"
      ? { threshold: { x: 0.2, y: 0.05 }, enabled: scrollEdge }
      : { enabled: scrollEdge };
  const droppingIn = active?.type === "pick" && insertAt !== null;

  return (
    <PickDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        autoScroll={autoScroll}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        {children}
        {mounted
          ? createPortal(
              <DragOverlay
                zIndex={200}
                dropAnimation={droppingIn ? null : undefined}
              >
                {active?.overlay ?? null}
              </DragOverlay>,
              document.body,
            )
          : null}
      </DndContext>
    </PickDndContext.Provider>
  );
}

const ROW_GAP = 8;

interface TargetCtx {
  targetId: string;
  ids: string[];
  rowHeight: number;
}
const TargetContext = createContext<TargetCtx | null>(null);

/**
 * The ordered target list. Rows (<TargetRow>) are its children; while a picked
 * item hovers, rows at or after the insertion index slide down to open a gap.
 */
export function PickTarget({
  targetId,
  ids,
  onChange,
  rowHeight = 56,
  empty,
  className,
  children,
}: {
  targetId: string;
  /** Current order. */
  ids: string[];
  onChange: (ids: string[], change: TargetChange) => void;
  /** Fixed row height in px; the opened gap matches it. */
  rowHeight?: number;
  /** Shown instead of the list when `ids` is empty. */
  empty?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { register, active, insertAt } = usePickDnd();
  useEffect(() => {
    register(targetId, { ids, onChange });
  }, [register, targetId, ids, onChange]);

  const { setNodeRef } = useDroppable({
    id: `container:${targetId}`,
    data: { type: "container", targetId } satisfies DragData,
  });
  const showGap = active?.type === "pick" && active.targetId === targetId;
  const gapAt = showGap ? insertAt : null;
  const ctx = useMemo(
    () => ({ targetId, ids, rowHeight }),
    [targetId, ids, rowHeight],
  );

  return (
    <TargetContext.Provider value={ctx}>
      <div
        ref={setNodeRef}
        data-testid={`target-${targetId}`}
        data-vaul-no-drag
        className={cn("relative", className)}
        style={{
          paddingBottom:
            gapAt !== null && gapAt >= ids.length && ids.length > 0
              ? rowHeight + ROW_GAP
              : undefined,
          transition: "padding-bottom 180ms ease",
        }}
      >
        {ids.length === 0 ? (
          <div className="relative">
            {empty}
            {gapAt !== null ? <GapMarker height={rowHeight} /> : null}
          </div>
        ) : (
          <SortableContext
            items={ids.map((id) => sortId(targetId, id))}
            strategy={verticalListSortingStrategy}
          >
            <ul
              data-gap-at={gapAt ?? undefined}
              className="flex flex-col"
              style={{ gap: ROW_GAP }}
            >
              {children}
            </ul>
          </SortableContext>
        )}
      </div>
    </TargetContext.Provider>
  );
}

function GapMarker({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      data-testid="drop-gap"
      style={{ height }}
      className="pointer-events-none absolute inset-x-0 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10"
    />
  );
}

export interface HandleProps extends HTMLAttributes<HTMLButtonElement> {
  ref: (el: HTMLElement | null) => void;
}

/**
 * One row of the target list. Renders an <li>; `children` receives the drag
 * handle props to spread on a `touch-none` button (omit them when `reorder`
 * is false).
 */
export function TargetRow({
  itemId,
  overlay,
  reorder = true,
  children,
}: {
  itemId: string;
  /** Node shown under the cursor while this row is dragged. */
  overlay: ReactNode;
  reorder?: boolean;
  children: (handle: {
    handleProps: HandleProps | null;
    dragging: boolean;
  }) => ReactNode;
}) {
  const target = useContext(TargetContext);
  if (!target) throw new Error("TargetRow must be inside a <PickTarget>");
  const { active, insertAt } = usePickDnd();
  const index = target.ids.indexOf(itemId);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortId(target.targetId, itemId),
    disabled: !reorder,
    data: {
      type: "item",
      targetId: target.targetId,
      itemId,
      index,
      overlay,
    } satisfies DragData,
  });

  const picking =
    active?.type === "pick" && active.targetId === target.targetId;
  const shift =
    picking && insertAt !== null && index >= insertAt
      ? target.rowHeight + ROW_GAP
      : 0;
  const isLast = index === target.ids.length - 1;
  const showGapHere = picking && insertAt !== null && insertAt === index;
  const showGapAfter =
    picking && insertAt !== null && isLast && insertAt >= target.ids.length;

  const handleProps: HandleProps | null = reorder
    ? {
        ref: setActivatorNodeRef,
        ...(attributes as unknown as HTMLAttributes<HTMLButtonElement>),
        ...(listeners as unknown as HTMLAttributes<HTMLButtonElement>),
      }
    : null;

  return (
    <li
      ref={setNodeRef}
      data-testid="target-row"
      data-item-id={itemId}
      className={cn("relative", isDragging && "opacity-30")}
      style={{
        height: target.rowHeight,
        transform: picking
          ? `translateY(${shift}px)`
          : CSS.Translate.toString(transform),
        transition: picking ? "transform 180ms ease" : transition,
      }}
    >
      {showGapHere ? (
        <div
          aria-hidden
          data-testid="drop-gap"
          style={{
            top: -(target.rowHeight + ROW_GAP),
            height: target.rowHeight,
          }}
          className="pointer-events-none absolute inset-x-0 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10"
        />
      ) : null}
      {showGapAfter ? (
        <div
          aria-hidden
          data-testid="drop-gap"
          style={{ top: target.rowHeight + ROW_GAP, height: target.rowHeight }}
          className="pointer-events-none absolute inset-x-0 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10"
        />
      ) : null}
      {children({ handleProps, dragging: isDragging })}
    </li>
  );
}

/**
 * A picker row wrapper: tap/click toggles via the child's own handler, and on
 * a mouse the row can be dragged into the target. Touch scrolling is untouched
 * because only the mouse activator is wired.
 */
export function PickerRow({
  targetId,
  itemId,
  overlay,
  draggable = true,
  className,
  children,
}: {
  targetId: string;
  itemId: string;
  overlay: ReactNode;
  /** False on touch layouts and for rows already in the target. */
  draggable?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `pick:${targetId}:${itemId}`,
    disabled: !draggable,
    data: { type: "pick", targetId, itemId, overlay } satisfies DragData,
  });
  return (
    <li
      ref={setNodeRef}
      onMouseDown={
        draggable
          ? (listeners?.onMouseDown as MouseEventHandler<HTMLLIElement>)
          : undefined
      }
      data-vaul-no-drag
      data-testid="picker-row"
      data-item-id={itemId}
      className={cn(isDragging && "opacity-40", className)}
    >
      {children}
    </li>
  );
}
