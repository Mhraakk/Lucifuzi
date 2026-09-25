import { trainingProducts } from "@/lib/products-catalog";
import ProductClient from "./ProductClient";

export function generateStaticParams() {
  return trainingProducts.map((p) => ({ slug: p.slug }));
}

export default function Page() {
  return <ProductClient />;
}
