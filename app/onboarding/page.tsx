"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { JOB_ROLE_LABELS, type JobRole } from "@/lib/types";
import { useAppState } from "@/lib/hooks";
import { completeOnboarding, setCurrentUser } from "@/lib/store";

const ROLES = Object.keys(JOB_ROLE_LABELS) as JobRole[];

export default function OnboardingPage() {
  const state = useAppState();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState("سارا محمدی");
  const [phone, setPhone] = useState("09121234567");
  const [branchId, setBranchId] = useState(state.branches[0]?.id ?? "");
  const [jobRole, setJobRole] = useState<JobRole>("sales_associate");
  const [experienceLevel, setExperienceLevel] =
    useState<"none" | "junior" | "mid" | "senior">("junior");
  const [previousJewelryExperience, setPrev] = useState(false);
  const [hireDate, setHireDate] = useState("2026-03-20");

  const path = state.learningPaths.find((p) => p.targetJobRoles.includes(jobRole));

  function finish() {
    setCurrentUser("user_emp_leila");
    completeOnboarding({
      fullName,
      phone,
      branchId,
      jobRole,
      experienceLevel,
      previousJewelryExperience,
      hireDate: new Date(hireDate).toISOString(),
    });
    router.push("/employee/home");
  }

  return (
    <div
      data-theme={state.theme}
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--bg)", color: "var(--ink)" }}
    >
      <div className="mx-auto max-w-md space-y-5 animate-in">
        <p className="text-xs faint">گالری طلای آریا · آنبوردینگ</p>
        <h1 className="page-title">خوش آمدید</h1>
        <p className="muted text-sm leading-7">
          قدم‌به‌قدم نقش شما مشخص می‌شود و مسیر یادگیری متناسب ساخته می‌شود — نه
          انبوه دوره‌های نامرتبط.
        </p>

        {step === 0 ? (
          <section className="surface p-4 space-y-3">
            <h2 className="section-title">اطلاعات پایه</h2>
            <div>
              <label className="label">نام کامل</label>
              <input className="field" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="label">موبایل</label>
              <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">شعبه</label>
              <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {state.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">تاریخ استخدام</label>
              <input
                className="field"
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary w-full" onClick={() => setStep(1)}>
              ادامه
            </button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="surface p-4 space-y-3">
            <h2 className="section-title">نقش شغلی</h2>
            <div className="grid gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="rounded-xl border p-3 text-right text-sm"
                  style={{
                    borderColor: jobRole === r ? "var(--accent)" : "var(--line)",
                    background: jobRole === r ? "var(--accent-soft)" : "transparent",
                  }}
                  onClick={() => setJobRole(r)}
                >
                  {JOB_ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <div>
              <label className="label">سطح تجربه</label>
              <select
                className="field"
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(
                    e.target.value as "none" | "junior" | "mid" | "senior"
                  )
                }
              >
                <option value="none">بدون تجربه</option>
                <option value="junior">تازه‌کار</option>
                <option value="mid">متوسط</option>
                <option value="senior">باسابقه</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={previousJewelryExperience}
                onChange={(e) => setPrev(e.target.checked)}
              />
              سابقه کار در طلافروشی دارم
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setStep(0)}>
                قبلی
              </button>
              <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(2)}>
                ادامه
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="surface p-4 space-y-4">
            <h2 className="section-title">مسیر پیشنهادی شما</h2>
            <p className="font-bold">{path?.title ?? "مسیر عمومی"}</p>
            <p className="muted text-sm leading-7">{path?.description}</p>
            <ul className="space-y-2">
              {(path?.courseIds ?? state.courses.slice(0, 3).map((c) => c.id)).map(
                (cid) => {
                  const c = state.courses.find((x) => x.id === cid);
                  return (
                    <li key={cid} className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg-soft)" }}>
                      {c?.title}
                    </li>
                  );
                }
              )}
            </ul>
            <p className="text-xs faint leading-6">
              سپس یک درس کوتاه و ارزیابی پایه دانش انجام می‌شود. مجوز کار مستقل
              بعداً با ارزیابی عملی مدیر صادر می‌شود.
            </p>
            <button type="button" className="btn btn-primary w-full" onClick={finish}>
              شروع آموزش
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
