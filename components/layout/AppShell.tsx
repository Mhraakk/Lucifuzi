"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAppState, useCurrentUser, useUnreadCount } from "@/lib/hooks";
import { isManagerLike } from "@/lib/permissions";
import { setTheme } from "@/lib/store";

const employeeNav = [
  { href: "/employee/home", label: "خانه", icon: "home" },
  { href: "/employee/learn", label: "آموزش", icon: "learn" },
  { href: "/employee/practice", label: "تمرین", icon: "practice" },
  { href: "/employee/skills", label: "مهارت‌ها", icon: "skills" },
  { href: "/employee/profile", label: "پروفایل", icon: "profile" },
];

const managerNav = [
  { href: "/manager/dashboard", label: "داشبورد", icon: "home" },
  { href: "/manager/employees", label: "کارکنان", icon: "people" },
  { href: "/manager/training", label: "آموزش", icon: "learn" },
  { href: "/manager/assessments", label: "ارزیابی", icon: "check" },
  { href: "/manager/settings", label: "بیشتر", icon: "more" },
];

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case "home":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "learn":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M4 5h10a2 2 0 0 1 2 2v12H6a2 2 0 0 0-2 2V5Z" />
          <path d="M16 7h4v12a2 2 0 0 1-2 2h-2" />
        </svg>
      );
    case "practice":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </svg>
      );
    case "skills":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3 14.5 9H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5L12 3Z" />
        </svg>
      );
    case "profile":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19.5c1.8-3.2 4.2-4.5 7-4.5s5.2 1.3 7 4.5" />
        </svg>
      );
    case "people":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3.5 19c1.5-3 3.6-4.2 5.5-4.2S14 16 15.5 19" />
          <path d="M14 14.8c1.4-.4 2.8.1 4 1.7" />
        </svg>
      );
    case "check":
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </svg>
      );
    default:
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
          <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export function AppShell({
  children,
  title,
  backHref,
  actions,
}: {
  children: ReactNode;
  title?: string;
  backHref?: string;
  actions?: ReactNode;
}) {
  const user = useCurrentUser();
  const state = useAppState();
  const pathname = usePathname();
  const unread = useUnreadCount();
  const manager = isManagerLike(user.systemRole);
  const nav = manager ? managerNav : employeeNav;

  return (
    <div
      data-theme={state.theme}
      className="min-h-screen text-[var(--ink)]"
      style={{ background: "var(--bg)" }}
    >
      <header className="sticky top-0 z-30 border-b hairline glass-bar">
        <div className="mx-auto flex max-w-desk items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="btn btn-ghost !min-h-11 !px-3 text-sm"
                aria-label="بازگشت"
              >
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ) : (
              <Link
                href={manager ? "/manager/dashboard" : "/employee/home"}
                className="min-w-0"
              >
                <p className="text-[11px] faint tracking-[0.08em]">
                  گالری طلای آریا
                </p>
                <p className="truncate text-sm font-bold">
                  {title ?? "آریا آموزش"}
                </p>
              </Link>
            )}
            {title && backHref ? (
              <h1 className="truncate text-base font-bold">{title}</h1>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              type="button"
              className="btn btn-ghost !min-h-11 !w-11 !px-0"
              onClick={() =>
                setTheme(state.theme === "light" ? "dark" : "light")
              }
              aria-label={state.theme === "light" ? "حالت تاریک" : "حالت روشن"}
            >
              {state.theme === "light" ? (
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
                  <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z" />
                </svg>
              ) : (
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M5 19l1.5-1.5" />
                </svg>
              )}
            </button>
            {!manager ? (
              <Link
                href="/employee/profile"
                className="relative btn btn-secondary !min-h-11 !w-11 !px-0"
                aria-label="اعلان‌ها"
              >
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
                  <path d="M10 18.5a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 ? (
                  <span
                    className="absolute -top-0.5 -left-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold status-pulse-wrap is-active"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    <span className="status-pulse-dot !absolute !inset-0 !bg-transparent" aria-hidden />
                    {unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="shell-main mx-auto max-w-desk px-4 pt-5 safe-bottom md:pb-12">
        {children}
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 z-30 border-t hairline glass-bar md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="منوی اصلی"
      >
        <ul className="mx-auto grid max-w-app grid-cols-5 gap-0.5 px-1.5 py-1.5">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`nav-item flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium ${
                    active ? "nav-item-active" : ""
                  }`}
                  style={{
                    color: active ? "var(--accent-deep)" : "var(--ink-muted)",
                    background: active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                  {active ? (
                    <span className="nav-indicator" aria-hidden />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <aside className="fixed bottom-6 left-6 z-20 hidden md:block">
        <div className="surface flex flex-col gap-1 p-2 text-sm">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent-deep)" : "var(--ink-muted)",
                }}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
