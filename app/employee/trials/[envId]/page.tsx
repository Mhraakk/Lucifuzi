"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { TrialWorkbench } from "@/components/trials/TrialWorkbench";
import type { TrialEnvId } from "@/lib/trials/catalog";
import { ROLE_ENVIRONMENTS } from "@/lib/trials/catalog";

const VALID = new Set(ROLE_ENVIRONMENTS.map((e) => e.id));

export default function EmployeeTrialEnvPage() {
  const { envId } = useParams<{ envId: string }>();
  const ok = VALID.has(envId as TrialEnvId);

  return (
    <AppShell title="محیط آزمایش" backHref="/employee/trials">
      <div className="mx-auto max-w-app pb-8 jx-page jx-page--atelier">
        {ok ? (
          <TrialWorkbench envId={envId as TrialEnvId} />
        ) : (
          <div className="surface p-4">
            <p className="muted text-sm">این محیط در کاتالوگ نیست.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
