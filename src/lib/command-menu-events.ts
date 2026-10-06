/**
 * Tiny window-event bridge between the command palette and the components that own
 * the matching UI (the Add Asset dialog, the statement import card). A request made
 * before the target is mounted (e.g. the palette navigates to /dashboard first) is
 * remembered for a few seconds and delivered when the target subscribes.
 */
export type QuickAction = "add-asset" | "upload-statement";

const QUICK_ACTION_EVENT = "opes:quick-action";
export const OPEN_COMMAND_MENU_EVENT = "opes:open-command-menu";
const PENDING_TTL_MS = 10_000;

let pending: { action: QuickAction; at: number } | null = null;

export function requestQuickAction(action: QuickAction) {
  if (typeof window === "undefined") return;
  pending = { action, at: Date.now() };
  window.dispatchEvent(new Event(QUICK_ACTION_EVENT));
}

export function openCommandMenu() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COMMAND_MENU_EVENT));
}

/** Subscribes `handler` to `action`; delivers a still-fresh pending request right away (async). Returns the cleanup. */
export function onQuickAction(action: QuickAction, handler: () => void): () => void {
  const deliver = () => {
    if (!pending || pending.action !== action) return;
    const fresh = Date.now() - pending.at < PENDING_TTL_MS;
    pending = null;
    if (fresh) handler();
  };
  window.addEventListener(QUICK_ACTION_EVENT, deliver);
  const timer = window.setTimeout(deliver, 0);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener(QUICK_ACTION_EVENT, deliver);
  };
}
