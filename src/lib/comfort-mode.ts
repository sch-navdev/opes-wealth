/**
 * Comfort (accessibility) display mode. The preference lives in `localStorage`
 * and is mirrored onto `<html data-comfort="on">`, which the rules at the end
 * of `app/globals.css` key off: bigger type, high contrast, 48px touch targets
 * and text labels beside icon-only buttons.
 *
 * `COMFORT_INIT_SCRIPT` runs in <head> before first paint so a returning user
 * never sees the normal layout flash; the store below keeps the toggle in step
 * (including across tabs via the `storage` event).
 */
export const COMFORT_STORAGE_KEY = "opes-comfort-mode";
const CHANGE_EVENT = "opes-comfort-change";

export const COMFORT_INIT_SCRIPT = `try{if(localStorage.getItem("${COMFORT_STORAGE_KEY}")==="on")document.documentElement.setAttribute("data-comfort","on")}catch(e){}`;

export function readComfortMode(): boolean {
  try {
    return localStorage.getItem(COMFORT_STORAGE_KEY) === "on";
  } catch {
    // Private mode / blocked storage: fall back to what the page currently shows.
    return document.documentElement.getAttribute("data-comfort") === "on";
  }
}

export function setComfortMode(on: boolean): void {
  if (on) document.documentElement.setAttribute("data-comfort", "on");
  else document.documentElement.removeAttribute("data-comfort");
  try {
    localStorage.setItem(COMFORT_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable: the mode still applies for this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeComfortMode(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
