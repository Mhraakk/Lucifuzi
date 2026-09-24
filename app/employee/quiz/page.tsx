import { Suspense } from "react";
import QuizPage from "./QuizClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 muted text-sm">در حال بارگذاری آزمونک...</div>}>
      <QuizPage />
    </Suspense>
  );
}
