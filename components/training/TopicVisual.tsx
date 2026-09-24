"use client";

import {
  ILLUSTRATIONS,
  illustrationForCourse,
  type IllustrationKey,
  type IllustrationMeta,
} from "@/lib/illustrations";

type Props = {
  topic?: IllustrationKey;
  meta?: IllustrationMeta;
  /** compact = card thumbnail strip */
  size?: "hero" | "card" | "inline";
  showCaption?: boolean;
  className?: string;
};

export function TopicVisual({
  topic = "home",
  meta,
  size = "hero",
  showCaption = true,
  className = "",
}: Props) {
  const m = meta ?? ILLUSTRATIONS[topic];
  const height =
    size === "hero" ? "h-44 sm:h-52" : size === "card" ? "h-28" : "h-36";

  return (
    <figure
      className={`topic-visual topic-visual--${m.motion} ${className}`}
    >
      <div className={`topic-visual__frame ${height}`}>
        <div className="topic-visual__shine" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.src}
          alt={m.alt}
          className="topic-visual__img"
          loading="lazy"
          decoding="async"
        />
        <div className="topic-visual__veil" aria-hidden />
      </div>
      {showCaption && size !== "card" ? (
        <figcaption className="topic-visual__caption">{m.caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function CourseCover({
  courseId,
  size = "hero",
  showCaption = true,
}: {
  courseId: string;
  size?: "hero" | "card" | "inline";
  showCaption?: boolean;
}) {
  return (
    <TopicVisual
      meta={illustrationForCourse(courseId)}
      size={size}
      showCaption={showCaption}
    />
  );
}
