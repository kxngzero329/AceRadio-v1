type ModalHistoryListener = (event: PopStateEvent) => void;
type ModalHistoryState = { active: ModalHistoryListener | null };
type HistoryWindow = Window & { __aceRadioModalHistory?: ModalHistoryState };

/** Register before the navigator subscribes; retain one listener across hot reloads. */
export function prepareModalHistory() {
  if (typeof window === "undefined") return;
  const host = window as HistoryWindow;
  if (!host.__aceRadioModalHistory) {
    const state: ModalHistoryState = { active: null };
    host.__aceRadioModalHistory = state;
    window.addEventListener("popstate", (event) => state.active?.(event), true);
  }
  return host.__aceRadioModalHistory;
}

export function registerModalHistoryListener(handler: ModalHistoryListener) {
  const state = prepareModalHistory();
  if (!state) return () => {};
  state.active = handler;
  return () => {
    if (state.active === handler) state.active = null;
  };
}
