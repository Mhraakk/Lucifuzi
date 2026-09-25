"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAppState, useCurrentUser, useUnreadCount } from "@/lib/hooks";
import { isManagerLike } from "@/lib/permissions";
import { setTheme, logoutUser } from "@/lib/store";
import { AmbientBackdrop } from "@/components/layout/AmbientBackdrop";
import { sculptureSlotFromPath } from "@/lib/atelier/sculptures";
import { clearSession, readSession } from "@/lib/auth/session";

const employeeNav = [
  { href: "/employee/home", label: "خانه", icon: "home" },
  { href: "/employee/learn", label: "آموزش", icon: "learn" },
  { href: "/employee/trials", label: "آزمایش", icon: "practice" },
  { href: "/employee/studio", label: "استودیو", icon: "studio" },
  { href: "/employee/profile", label: "من", icon: "profile" },
];

const managerNav = [
  { href: "/manager/dashboard", label: "خانه", icon: "home" },
  { href: "/manager/employees", label: "کارکنان", icon: "people" },
  { href: "/manager/training", label: "آموزش", icon: "learn" },
  { href: "/manager/responsibilities", label: "مسئولیت", icon: "check" },
  { href: "/manager/assessments", label: "ارزیابی", icon: "spark" },
];

function NavIcon({ name }: { name: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "learn":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M5 5.5h9.5A2.5 2.5 0 0 1 17 8v11.5H7A2 2 0 0 0 5 21.5V5.5Z" />
          <path d="M17 8h2.5v11.5A2 2 0 0 1 17.5 21.5H17" />
          <path d="M8.5 9.5h5M8.5 13h5" />
        </svg>
      );
    case "gem":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 3.5 16.5 9 12 20.5 7.5 9 12 3.5Z" />
          <path d="M7.5 9h9" />
          <path d="M10 3.8 7.5 9M14 3.8 16.5 9" />
        </svg>
      );
    case "studio":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 4.2 18.5 8v8L12 19.8 5.5 16V8L12 4.2Z" />
          <path d="M12 12v7.8M12 12 18.5 8M12 12 5.5 8" />
        </svg>
      );
    case "practice":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2" />
        </svg>
      );
    case "profile":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <circle cx="12" cy="9" r="3.2" />
          <path d="M6 19c1.4-3 3.4-4.3 6-4.3s4.6 1.3 6 4.3" />
        </svg>
      );
    case "people":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <circle cx="9" cy="8.5" r="2.8" />
          <circle cx="16.5" cy="9.2" r="2.2" />
          <path d="M4 19c1.3-2.8 3.2-4 5-4s3.7 1.2 5 4" />
          <path d="M14 15.2c1.3-.5 2.7 0 4 1.8" />
        </svg>
      );
    case "check":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <circle cx="12" cy="12" r="7.5" />
          <path d="m8.6 12.2 2.4 2.4 4.4-4.8" />
        </svg>
      );
    case "spark":
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <path d="M12 3.5 13.6 9.2 19.5 11 13.6 12.8 12 18.5 10.4 12.8 4.5 11 10.4 9.2 12 3.5Z" />
        </svg>
      );
    default:
      return (
        <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden {...common}>
          <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
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
  const router = useRouter();
  const unread = useUnreadCount();
  const manager = isManagerLike(user.systemRole);
  const nav = manager ? managerNav : employeeNav;

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login");
    }
  }, [router, pathname]);

  function handleLogout() {
    clearSession();
    logoutUser();
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div
      data-theme={state.theme}
      className="app-atmosphere relative min-h-screen text-[var(--ink)]"
      style={{ background: "transparent" }}
    >
      <AmbientBackdrop
        variant={manager ? "wall" : sculptureSlotFromPath(pathname)}
      />
      <header className="sticky top-0 z-30 border-b hairline glass-bar">
        <div className="mx-auto flex max-w-desk items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="btn btn-ghost tap-react !min-h-11 !px-3 text-sm"
                aria-label="بازگشت"
              >
                <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M9 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </Link>
            ) : (
              <Link
                href={manager ? "/manager/dashboard" : "/employee/home"}
                className="min-w-0 shell-brand"
              >
                <p className="shell-brand__mark">Beatris</p>
                <p className="shell-brand__title">{title ?? "آتلیه"}</p>
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
              className="btn btn-ghost tap-react !min-h-11 !px-2.5 text-xs"
              onClick={handleLogout}
              aria-label="خروج"
            >
              خروج
            </button>
            <button
              type="button"
              className="btn btn-ghost tap-react !min-h-11 !w-11 !px-0"
              onClick={() =>
                setTheme(state.theme === "light" ? "dark" : "light")
              }
              aria-label={state.theme === "light" ? "حالت تاریک" : "حالت روشن"}
            >
              {state.theme === "light" ? (
                <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                </svg>
              ) : (
                <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden>
                  <circle
                    cx="12"
                    cy="12"
                    r="4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M5 19l1.5-1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
            {!manager ? (
              <Link
                href="/employee/profile"
                className="relative btn btn-secondary tap-react !min-h-11 !w-11 !px-0"
                aria-label="اعلان‌ها"
              >
                <svg className="dock-icon" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M10 18.5a2 2 0 0 0 4 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                </svg>
                {unread > 0 ? (
                  <span
                    className="absolute -top-0.5 -left-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
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

      <main className="shell-main relative z-[1] mx-auto max-w-desk px-4 pt-5 safe-bottom md:pb-12">
        {children}
      </main>

      {/* Floating luxury dock — replaces flat bottom bar */}
      <nav
        className="dock-nav md:hidden"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
        aria-label="منوی اصلی"
      >
        <ul className="dock-nav__inner">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="dock-nav__item">
                <Link
                  href={item.href}
                  className={`dock-link tap-react ${active ? "is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="dock-link__icon" aria-hidden>
                    <NavIcon name={item.icon} />
                  </span>
                  <span className="dock-link__label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <aside className="fixed bottom-6 left-6 z-20 hidden md:block">
        <div className="dock-side">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dock-side__link tap-react ${active ? "is-active" : ""}`}
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
