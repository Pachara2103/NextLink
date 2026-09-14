/** Move keyboard focus with the visual position when following an in-page shortcut. */
export function focusDashboardSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  section.focus({ preventScroll: true });
  section.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });
}
