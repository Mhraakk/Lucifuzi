import { courses } from "@/lib/demo-data";
import ClientPage from "./ClientPage";

export function generateStaticParams() {
  return courses.map((c) => ({ id: c.id }));
}

export default function Page() {
  return <ClientPage />;
}
