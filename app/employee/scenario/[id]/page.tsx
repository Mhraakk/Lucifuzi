import { trainingScenarios } from "@/lib/demo-data";
import ClientPage from "./ClientPage";

export function generateStaticParams() {
  return trainingScenarios.map((s) => ({ id: s.id }));
}

export default function Page() {
  return <ClientPage />;
}
