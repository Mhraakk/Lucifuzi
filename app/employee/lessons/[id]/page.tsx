import { lessons } from "@/lib/demo-data";
import ClientPage from "./ClientPage";

export function generateStaticParams() {
  return lessons.map((l) => ({ id: l.id }));
}

export default function Page() {
  return <ClientPage />;
}
