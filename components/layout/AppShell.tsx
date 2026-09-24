"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAppState, useCurrentUser, useUnreadCount } from "@/lib/hooks";
import { isManagerLike } from "@/lib/permissions";
import { setTheme } from "@/lib/store";

const employeeNav = [
  { href: "/employee/home", label: "خانه", icon: "خانه" },
  { href: "/employee/learn", label: "آموزش", icon: "آموزش" },
  { href: "/employee/practice", label: "تمرین", icon: "تمرین" },
  { href: "/employee/skills", label: "مهارت‌ها", icon: "مهارت" },
  { href: "/employee/profile", label: "پروفایل", icon: "من" },
];

const managerNav = [
  { href: "/manager/dashboard", label: "داشبورد", icon: "داشبورد" },
  { href: "/manager/employees", label: "کارکنان", icon: "کارکنان" },
  { href: "/manager/training", label: "آموزش", icon: "آموزش" },
  { href: "/manager/assessments", label: "ارزیابی", icon: "ارزیابی" },
  { href: "/manager/settings", label: "بیشتر", icon: "بیشتر" },
];

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
      <header className="sticky top-0 z-30 border-b hairline backdrop-blur-md"
        style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}
      >
        <div className="mx-auto flex max-w-desk items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {backHref ? (
              <Link href={backHref} className="btn btn-ghost !min-h-10 !px-2 text-sm">
                بازگشت
              </Link>
            ) : (
              <Link href={manager ? "/manager/dashboard" : "/employee/home"} className="min-w-0">
                <p className="text-[11px] faint tracking-wide">گالری طلای آریا</p>
                <p className="truncate text-sm font-bold">{title ?? "سامانه آموزش عملیاتی"}</p>
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
              className="btn btn-ghost !min-h-10 !px-3 text-xs"
              onClick={() => setTheme(state.theme === "light" ? "dark" : "light")}
              aria-label="تغییر تم"
            >
              {state.theme === "light" ? "تاریک" : "روشن"}
            </button>
            {!manager ? (
              <Link href="/employee/profile" className="relative btn btn-secondary !min-h-10 !px-3 text-xs">
                اعلان
                {unread > 0 ? (
                  <span
                    className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    {unread}
                  </span>
                ) : null}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-desk px-4 pt-4 safe-bottom md:pb-10">
        {children}
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 z-30 border-t hairline md:hidden"
        style={{
          background: "color-mix(in srgb, var(--bg-elevated) 94%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="منوی اصلی"
      >
        <ul className="mx-auto grid max-w-app grid-cols-5 gap-1 px-2 py-2">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-[52px] flex-col items-center justify-center rounded-xl text-[11px] font-medium"
                  style={{
                    color: active ? "var(--accent-deep)" : "var(--ink-muted)",
                    background: active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <span className="mb-0.5 text-[10px] opacity-70">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <aside className="fixed bottom-6 left-6 hidden md:block">
        <div className="surface flex flex-col gap-1 p-2 text-sm">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-4 py-2"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent-deep)" : "var(--ink-muted)",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
