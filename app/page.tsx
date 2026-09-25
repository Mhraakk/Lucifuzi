"use client";

import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/hooks";
import { setCurrentUser } from "@/lib/store";
import { sculptureSrc } from "@/lib/atelier/sculptures";
import { useEffect } from "react";

export default function HomeRedirect() {
  const state = useAppState();
  const router = useRouter();

  useEffect(() => {
    const user = state.users.find((u) => u.id === state.currentUserId);
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.systemRole === "employee") {
      router.replace("/employee/home");
    } else {
      router.replace("/manager/dashboard");
    }
  }, [router, state.currentUserId, state.users]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="login-atelier" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sculptureSrc("intro")} alt="" />
        <div className="login-atelier__veil" />
      </div>
      <div className="relative z-[1] login-hero-card mx-6 text-center">
        <p className="brand-mark mb-2 !text-3xl">آریا</p>
        <p className="muted text-sm">در حال باز کردن آتلیه آموزش...</p>
      </div>
      <button
        type="button"
        className="sr-only"
        onClick={() => setCurrentUser("user_emp_leila")}
      >
        demo
      </button>
    </div>
  );
}
