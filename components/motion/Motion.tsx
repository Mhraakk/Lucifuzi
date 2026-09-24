"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MOTION, prefersReducedMotion, runMotionClass } from "@/lib/motion";

/** Tier B — purposeful page/section entrance (skipped if reduced motion). */
export function MotionEnter({
  children,
  className = "",
  delayMs = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: "div" | "section" | "article" | "header" | "figure";
}) {
  const style: CSSProperties =
    delayMs > 0 ? { animationDelay: `${delayMs}ms` } : {};
  return (
    <Tag className={`motion-enter ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}

/** Tier A — status pulse for elements that need attention. */
export function StatusPulse({
  children,
  active = true,
  className = "",
}: {
  children?: ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`status-pulse-wrap ${active ? "is-active" : ""} ${className}`.trim()}
    >
      <span className="status-pulse-dot" aria-hidden />
      {children}
    </span>
  );
}

/** Tier C — brief celebration on success (scale + soft glow). */
export function SuccessPop({
  show,
  children,
  className = "",
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`success-pop ${show ? "is-shown" : ""} ${className}`.trim()}
      role={show ? "status" : undefined}
    >
      {children}
    </div>
  );
}

/** Tier A — shake feedback for invalid input (physical “no” gesture). */
export function useShake() {
  const ref = useRef<HTMLDivElement | null>(null);
  function shake() {
    runMotionClass(ref.current, "motion-shake", MOTION.base);
  }
  return { ref, shake };
}

/** Hook for optional JS animations that respect OS preference. */
export function useAllowsMotion(): boolean {
  const [allows, setAllows] = useState(false);
  useEffect(() => {
    setAllows(!prefersReducedMotion());
    const mq = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const onChange = () => setAllows(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return allows;
}
