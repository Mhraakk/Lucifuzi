"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Feedback";
import { toPersianDigits } from "@/lib/format";
import { useAppState, useCurrentUser } from "@/lib/hooks";

export default function ManagerSopsPage() {
  const state = useAppState();
  const user = useCurrentUser();
  const employees = state.users.filter((u) => {
    if (u.systemRole !== "employee") return false;
    if (user.systemRole === "owner") return true;
    return u.branchId === user.branchId;
  });

  return (
    <AppShell title="دستورالعمل‌ها" backHref="/manager/training">
      <div className="mx-auto max-w-app space-y-3">
        {state.sops.map((sop) => {
          const ver = state.sopVersions.find((v) => v.id === sop.currentVersionId);
          const pending = employees.filter(
            (e) =>
              !state.sopAcknowledgments.some(
                (a) =>
                  a.userId === e.id &&
                  a.sopId === sop.id &&
                  a.versionId === sop.currentVersionId
              )
          ).length;
          return (
            <Link key={sop.id} href={`/employee/sop/${sop.id}`} className="surface block p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm">{sop.title}</p>
                  <p className="muted text-xs mt-1">
                    نسخه {toPersianDigits(ver?.version ?? 1)} · {sop.category}
                  </p>
                </div>
                {sop.requiresAcknowledgment ? (
                  <Badge tone={pending ? "warning" : "success"}>
                    {pending
                      ? `${toPersianDigits(pending)} بدون تأیید`
                      : "کامل"}
                  </Badge>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
