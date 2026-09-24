import { sops } from "@/lib/demo-data";
import ClientPage from "./ClientPage";

export function generateStaticParams() {
  return sops.map((s) => ({ id: s.id }));
}

export default function Page() {
  return <ClientPage />;
}
