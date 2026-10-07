"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Check, EyeOff, GripVertical, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardLayout } from "@/components/dashboard-layout-provider";
import { blockLabelKey, useDashboardLayoutText } from "@/components/dashboard-layout-text";
import { useTierMotion } from "@/components/tier-gate";
import { useReducedMotion } from "@/components/use-reduced-motion";
import {
  BLOCK_SIZES,
  getBlock,
  isHidden,
  sizeOf,
  visibleBlocks,
  type BlockId,
  type BlockSize,
} from "@/lib/dashboard-layout";
import type { DLayoutKey } from "@/lib/dashboard-layout-labels";
import { cn } from "@/lib/utils";

/** Literal class names (Tailwind scans for them). Spans start at `xl`; below that everything is one column. */
const SIZE_CLASS: Record<BlockSize, string> = {
  s: "xl:col-span-4",
  m: "xl:col-span-6",
  l: "xl:col-span-8",
  full: "xl:col-span-12",
};

const SIZE_TEXT_KEY: Record<BlockSize, DLayoutKey> = {
  s: "dlayout_size_s",
  m: "dlayout_size_m",
  l: "dlayout_size_l",
  full: "dlayout_size_full",
};

const SIZE_NAME_KEY: Record<BlockSize, DLayoutKey> = {
  s: "dlayout_size_name_s",
  m: "dlayout_size_name_m",
  l: "dlayout_size_name_l",
  full: "dlayout_size_name_full",
};

const GRID = "grid grid-cols-1 gap-x-4 gap-y-6 xl:grid-cols-12";

export type DashboardBlockContent = Partial<Record<BlockId, ReactNode>>;

/**
 * Renders the dashboard's blocks. `content` maps a block id to its (server-rendered) content;
 * a block with no content (e.g. the attribution tile when there is nothing foreign to attribute)
 * is simply not shown in normal mode. Normal mode: visible blocks in the saved order on a 12-column
 * grid (the default layout reproduces the page as it was). Edit mode: every block the tier
 * offers, as a card you can switch on/off (click), move (drag or arrows) and resize.
 */
export function DashboardLayoutGrid({ content }: { content: DashboardBlockContent }) {
  const { editing, layout, tier, status } = useDashboardLayout();
  const text = useDashboardLayoutText();

  const statusText =
    status === "saving"
      ? text("dlayout_status_saving")
      : status === "saved"
        ? text("dlayout_status_saved")
        : status === "local"
          ? text("dlayout_status_local")
          : status === "failed"
            ? text("dlayout_status_failed")
            : "";

  return (
    <>
      {/* Always mounted so assistive tech announces the save result when it appears. */}
      <p
        role="status"
        aria-live="polite"
        data-testid="layout-status"
        className={cn(
          statusText
            ? cn(
                "mb-4 border px-3 py-2 text-sm",
                status === "failed" || status === "local"
                  ? "border-destructive/50 text-destructive"
                  : "border-border text-muted-foreground",
              )
            : "sr-only",
        )}
      >
        {statusText}
      </p>
      {editing ? (
        <EditMode content={content} />
      ) : (
        <NormalMode content={content} layout={layout} tier={tier} allHiddenText={text("dlayout_all_hidden")} />
      )}
    </>
  );
}

function NormalMode({
  content,
  layout,
  tier,
  allHiddenText,
}: {
  content: DashboardBlockContent;
  layout: ReturnType<typeof useDashboardLayout>["layout"];
  tier: ReturnType<typeof useDashboardLayout>["tier"];
  allHiddenText: string;
}) {
  const ids = visibleBlocks(layout, tier).filter((id) => content[id] != null);
  if (ids.length === 0) {
    return <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{allHiddenText}</p>;
  }
  return (
    <div className={GRID}>
      {ids.map((id) => (
        <div key={id} data-testid={`block-${id}`} data-size={sizeOf(layout, id)} className={cn("min-w-0 space-y-6", SIZE_CLASS[sizeOf(layout, id)])}>
          {content[id]}
        </div>
      ))}
    </div>
  );
}

/* ---------- edit mode ---------- */

function EditMode({ content }: { content: DashboardBlockContent }) {
  const { layout, tier, done, cancel, reset, move } = useDashboardLayout();
  const text = useDashboardLayoutText();
  const [announcement, setAnnouncement] = useState("");

  const ids = layout.order;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labelOf = (id: unknown) => text(blockLabelKey(String(id)));
  const posOf = (id: unknown) => ids.indexOf(id as BlockId) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => text("dlayout_ann_start", { label: labelOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? text("dlayout_ann_over", { label: labelOf(active.id), position: posOf(over.id), total: ids.length }) : undefined,
    onDragEnd: ({ active, over }) =>
      text("dlayout_ann_drop", { label: labelOf(active.id), position: posOf(over?.id ?? active.id), total: ids.length }),
    onDragCancel: ({ active }) => text("dlayout_ann_cancel", { label: labelOf(active.id), position: posOf(active.id) }),
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(active.id as BlockId, ids.indexOf(over.id as BlockId));
  }

  return (
    <div data-testid="layout-editor" data-tier={tier}>
      <div
        role="region"
        aria-label={text("dlayout_banner_title")}
        className="z-30 mb-6 flex flex-wrap items-center gap-3 border border-primary/50 bg-card px-4 py-3 shadow-sm md:sticky md:top-2"
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm font-semibold text-foreground">{text("dlayout_banner_title")}</p>
          <p className="text-sm text-muted-foreground">{text("dlayout_hint")}</p>
          <p className="text-xs text-muted-foreground">{text("dlayout_sizes_hint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw aria-hidden="true" className="rtl:-scale-x-100" />
            {text("dlayout_reset")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={cancel}>
            <X aria-hidden="true" />
            {text("dlayout_cancel")}
          </Button>
          <Button type="button" size="sm" onClick={() => void done()}>
            <Check aria-hidden="true" />
            {text("dlayout_done")}
          </Button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: text("dlayout_sr_instructions") },
        }}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className={GRID}>
            {ids.map((id, index) => (
              <EditableBlock
                key={id}
                id={id}
                index={index}
                total={ids.length}
                onAnnounce={setAnnouncement}
              >
                {content[id]}
              </EditableBlock>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function EditableBlock({
  id,
  index,
  total,
  children,
  onAnnounce,
}: {
  id: BlockId;
  index: number;
  total: number;
  children: ReactNode;
  onAnnounce: (message: string) => void;
}) {
  const { layout, toggle, moveBy, resize } = useDashboardLayout();
  const text = useDashboardLayoutText();
  const reduced = useReducedMotion();
  const motion = useTierMotion();

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: reduced ? null : { duration: motion.durationMs, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  });

  const block = getBlock(id);
  const label = text(blockLabelKey(id));
  const active = !isHidden(layout, id);
  const size = sizeOf(layout, id);

  return (
    <div
      ref={setNodeRef}
      data-testid={`block-${id}`}
      data-size={size}
      data-active={active}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 40 : undefined,
      }}
      className={cn(
        "relative min-w-0 border-2",
        SIZE_CLASS[size],
        active ? "border-primary/70 bg-primary/5" : "border-dashed border-border bg-muted/30",
        isDragging && "shadow-lg ring-2 ring-primary/50",
      )}
    >
      <div className="relative z-10 flex flex-wrap items-center gap-2 border-b border-border/60 bg-card px-2 py-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={text("dlayout_drag_aria", { label })}
          className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center border border-border bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>

        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>

        <span
          className={cn(
            "inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs font-medium",
            active ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground",
          )}
        >
          {active ? <Check aria-hidden="true" className="size-3" /> : <EyeOff aria-hidden="true" className="size-3" />}
          {active ? text("dlayout_state_on") : text("dlayout_state_off")}
        </span>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={index === 0}
            aria-label={text("dlayout_move_up", { label })}
            onClick={() => {
              moveBy(id, -1);
              onAnnounce(text("dlayout_ann_over", { label, position: index, total }));
            }}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={index === total - 1}
            aria-label={text("dlayout_move_down", { label })}
            onClick={() => {
              moveBy(id, 1);
              onAnnounce(text("dlayout_ann_over", { label, position: index + 2, total }));
            }}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>

        <div role="group" aria-label={text("dlayout_size_group", { label })} className="flex items-center border border-border">
          {BLOCK_SIZES.map((s) => {
            const allowed = block.allowedSizes.includes(s);
            const selected = size === s;
            return (
              <button
                key={s}
                type="button"
                disabled={!allowed}
                aria-pressed={selected}
                aria-label={text(SIZE_NAME_KEY[s])}
                title={text(SIZE_NAME_KEY[s])}
                data-size-option={s}
                onClick={() => resize(id, s)}
                className={cn(
                  "h-8 min-w-8 px-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-30",
                  selected ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted",
                )}
              >
                {text(SIZE_TEXT_KEY[s])}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        {/* The whole preview is one big toggle; the content under it is inert so it cannot steal the click. */}
        <button
          type="button"
          aria-pressed={active}
          aria-label={label}
          data-testid={`block-toggle-${id}`}
          onClick={() => {
            toggle(id);
            onAnnounce(text(active ? "dlayout_ann_off" : "dlayout_ann_on", { label }));
          }}
          className="absolute inset-0 z-[1] size-full cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/60"
        />
        <div
          inert
          className={cn(
            "pointer-events-none max-h-72 select-none space-y-6 overflow-hidden p-3 motion-safe:transition-[opacity,filter]",
            !active && "opacity-40 grayscale",
          )}
        >
          {children ?? <p className="text-sm text-muted-foreground">{text("dlayout_no_data")}</p>}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
        />
      </div>
    </div>
  );
}
