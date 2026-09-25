"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { formatJalaliDate, toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser, useEmployeeProfile } from "@/lib/hooks";
import { markNotificationRead, resetDemo, setCurrentUser } from "@/lib/store";
import { JOB_ROLE_LABELS, SYSTEM_ROLE_LABELS } from "@/lib/types";

export default function ProfilePage() {
  const state = useAppState();
  const user = useCurrentUser();
  const profile = useEmployeeProfile();
  const router = useRouter();
  const notes = state.notifications.filter((n) => n.userId === user.id);

  return (
    <AppShell title="پروفایل">
      <div className="mx-auto max-w-app space-y-5">
        <section className="surface p-5 text-center">
          <div
            className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
          >
            {user.avatarInitials}
          </div>
          <h1 className="page-title !text-xl">{user.fullName}</h1>
          <p className="muted text-sm mt-2">
            {SYSTEM_ROLE_LABELS[user.systemRole]}
            {profile ? ` · ${JOB_ROLE_LABELS[profile.jobRole]}` : null}
          </p>
          <p className="faint text-xs mt-2">{user.phone}</p>
        </section>

        <section>
          <h2 className="section-title mb-3">اعلان‌ها</h2>
          <div className="space-y-2">
            {notes.map((n) => (
              <button
                key={n.id}
                type="button"
                className="surface w-full p-4 text-right"
                onClick={() => {
                  markNotificationRead(n.id);
                  if (n.href) router.push(n.href);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{n.title}</p>
                  {!n.read ? <Badge tone="warning">جدید</Badge> : null}
                </div>
                <p className="muted text-sm mt-1 leading-7">{n.body}</p>
                <p className="faint text-xs mt-2">{formatJalaliDate(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/employee/certificates" className="btn btn-secondary">
            مدارک ({toPersianDigits(state.certificates.filter((c) => c.userId === user.id).length)})
          </Link>
          <Link href="/employee/assistant" className="btn btn-secondary">
            دستیار
          </Link>
        </div>

        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={() => {
            setCurrentUser("user_emp_nima");
            router.push("/login");
          }}
        >
          خروج / تعویض کاربر
        </button>
        <button
          type="button"
          className="btn btn-ghost w-full text-xs"
          onClick={() => {
            resetDemo();
            router.refresh();
          }}
        >
          بازنشانی داده نمونه
        </button>
      </div>
    </AppShell>
  );
}
