import { Suspense } from "react";
import EmployeesClient from "./EmployeesClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 muted text-sm">در حال بارگذاری...</div>}>
      <EmployeesClient />
    </Suspense>
  );
}
