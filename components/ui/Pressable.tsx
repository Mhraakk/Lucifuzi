"use client";

import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useState,
} from "react";

type Feedback = {
  label: string;
  tone?: "ok" | "warn" | "info";
};

/**
 * Touch-reactive control — every tap scales, flashes, and can emit output text.
 */
export function Pressable({
  children,
  className = "",
  feedback,
  onPress,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  feedback?: Feedback;
  onPress?: () => void;
}) {
  const [flash, setFlash] = useState<Feedback | null>(null);

  return (
    <div className="pressable-wrap">
      <button
        type="button"
        className={`tap-react ${className}`.trim()}
        {...rest}
        onClick={(e) => {
          rest.onClick?.(e);
          onPress?.();
          if (feedback) {
            setFlash(feedback);
            window.setTimeout(() => setFlash(null), 1600);
          }
        }}
      >
        {children}
      </button>
      {flash ? (
        <p
          className={`tap-output tap-output--${flash.tone ?? "info"}`}
          role="status"
        >
          {flash.label}
        </p>
      ) : null}
    </div>
  );
}

export function PressableLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`tap-react ${className}`.trim()}>
      {children}
    </Link>
  );
}
