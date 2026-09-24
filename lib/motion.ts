/**
 * Motion tokens — aligned with predictable / purposeful / playful principles.
 * Durations follow 100–500ms guidance (small ~100ms, enter/exit ~200–300ms).
 */

export const MOTION = {
  fast: 100,
  base: 220,
  enter: 280,
  celebrate: 420,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

/** Run a one-shot class animation (shake, pop) only when motion is allowed. */
export function runMotionClass(
  el: HTMLElement | null,
  className: string,
  durationMs = MOTION.base
): void {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(className);
  // Force reflow so re-adding restarts the animation
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), durationMs + 40);
}
