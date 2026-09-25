"use client";

import {
  sculptureSrc,
  sculptureWork,
  type SculptureSlot,
} from "@/lib/atelier/sculptures";

/**
 * Immersive sculptural world — marble atmosphere behind every surface.
 * Not decoration: the room you stand in.
 */
export function AmbientBackdrop({
  variant = "wall",
}: {
  variant?: SculptureSlot | "wall" | "products";
}) {
  const slot: SculptureSlot =
    variant === "products"
      ? "products"
      : variant === "wall"
        ? "wall"
        : variant;

  const work = sculptureWork(slot);
  const src = sculptureSrc(slot);

  return (
    <div className="ambient-backdrop ambient-backdrop--marble" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="ambient-backdrop__photo"
        data-sculpture={work.id}
      />
      <div className="ambient-backdrop__wash" />
      <div className="ambient-backdrop__caustic" />
      <div className="ambient-backdrop__grain" />
      <div className="ambient-backdrop__glow" />
      <div className="ambient-backdrop__vignette" />
    </div>
  );
}
