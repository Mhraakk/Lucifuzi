"use client";

import { useEffect } from "react";
import { getSnapshot, subscribe } from "@/lib/store";

/** Keeps data-theme on html in sync for first paint helpers */
export function ThemeBoot() {
  useEffect(() => {
    const apply = () => {
      document.documentElement.setAttribute("data-theme", getSnapshot().theme);
    };
    apply();
    return subscribe(apply);
  }, []);
  return null;
}
