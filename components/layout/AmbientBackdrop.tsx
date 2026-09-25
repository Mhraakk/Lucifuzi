"use client";

/**
 * Soft photographic wash — products or wall only (no portrait).
 */
export function AmbientBackdrop({
  variant = "wall",
}: {
  variant?: "wall" | "products";
}) {
  const src =
    variant === "products"
      ? "/atelier/atelier-products.png"
      : "/atelier/atelier-wall.png";

  return (
    <div className="ambient-backdrop" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="ambient-backdrop__photo" />
      <div className="ambient-backdrop__wash" />
      <div className="ambient-backdrop__grain" />
      <div className="ambient-backdrop__glow" />
    </div>
  );
}
