import { courses } from "@/lib/demo-data";
import ClientPage from "./ClientPage";

/** Exam pages are keyed by courseId in this app */
export function generateStaticParams() {
  return courses.map((c) => ({ id: c.id }));
}

export default function Page() {
  return <ClientPage />;
}
