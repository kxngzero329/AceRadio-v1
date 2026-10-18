import { colors } from "./colors";

/** Keep browser controls, text selection and keyboard focus in the same palette. */
export function applyWebTheme() {
  if (typeof document === "undefined") return;
  const id = "aceradio-theme";
  const style = document.getElementById(id) ?? document.createElement("style");
  style.id = id;
  style.textContent = `
    :root { color-scheme: dark; accent-color: ${colors.accent}; -webkit-tap-highlight-color: transparent; }
    html, body { background: ${colors.background}; color: ${colors.white}; }
    a, a:visited { color: inherit; }
    ::selection { background: ${colors.selection}; color: ${colors.white}; }
    :focus-visible { outline: 2px solid ${colors.accent} !important; outline-offset: 2px; }
    @media (forced-colors: active) {
      :focus-visible { outline-color: Highlight !important; }
    }
  `;
  if (!style.parentNode) document.head.appendChild(style);
}
