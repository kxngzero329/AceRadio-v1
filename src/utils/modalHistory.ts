/** Browser history interception is supplied by the platform-specific web module. */
export function prepareModalHistory() {}

export function registerModalHistoryListener(
  _handler: (event: PopStateEvent) => void,
) {
  return () => {};
}
