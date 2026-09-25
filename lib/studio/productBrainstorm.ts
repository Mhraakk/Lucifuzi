/**
 * Per-product 3D brainstorm seeds — every gold SKU opens a sculpt session
 * that helps the floor team ideate variants, presents, and upsells.
 */

import { getProduct, trainingProducts, type TrainingProduct } from "@/lib/products-catalog";
import type { GemId, GoldKarat, StudioFormId } from "@/lib/studio/catalog";

export type BrainstormPrompt = {
  id: string;
  titleFa: string;
  bodyFa: string;
  /** How this idea helps the store floor */
  storeHelpFa: string;
};

export type ProductStudioSeed = {
  productSlug: string;
  productNameFa: string;
  brandFa: string;
  form: StudioFormId;
  karat: GoldKarat;
  gem: GemId;
  title: string;
  accent: string;
  prompts: BrainstormPrompt[];
};

function inferForm(product: TrainingProduct): StudioFormId {
  const s = product.slug;
  if (product.category === "zarbed") return "bar";
  if (product.category === "zardis") return "plaque";
  if (product.category === "melted") return "raw";
  if (s.includes("ring")) return "ring";
  if (s.includes("bracelet")) return "bracelet";
  if (s.includes("chain") || s.includes("set")) return "chain";
  if (s.includes("earring")) return "earring";
  if (s.includes("pendant") || s.includes("plaque")) return "pendant";
  return "raw";
}

function inferGem(product: TrainingProduct): GemId {
  if (product.style === "bridal") return "diamond";
  if (product.category === "zarbed" || product.category === "melted") {
    return "pearl";
  }
  if (product.style === "gift") return "turquoise";
  if (product.style === "modern") return "sapphire";
  if (product.style === "classic") return "ruby";
  return "diamond";
}

function promptsFor(product: TrainingProduct): BrainstormPrompt[] {
  const name = product.nameFa;
  const base: BrainstormPrompt[] = [
    {
      id: "variant",
      titleFa: "واریانت ویترین",
      bodyFa: `یک نسخه جایگزین از «${name}» بسازید — کمی پهن‌تر، کوتاه‌تر، یا با نگین دیگر — تا مشتری حق انتخاب داشته باشد.`,
      storeHelpFa: "کاهش ترک میز: دو گزینه هم‌بودجه روی سینی، بدون فشار فروش.",
    },
    {
      id: "present",
      titleFa: "ارائه روی سینی",
      bodyFa: `قطعه را شکل دهید و در حالت ارائه بچرخانید؛ روایت کوتاه فروش (${product.taglineFa}) را با هم‌تیمی تمرین کنید.`,
      storeHelpFa: "تمرین زبان ارائه قبل از شیفت — سرعت و اعتماد روی کف گالری.",
    },
    {
      id: "upsell",
      titleFa: "ست و ارتقا",
      bodyFa:
        product.category === "zarbed" || product.category === "melted"
          ? `از فرم سرمایه‌ای شروع کنید؛ یک پلاک یا زنجیر مکمل تصور کنید تا مسیر هدیه/پس‌انداز را به مشتری نشان دهید.`
          : `یک قطعه مکمل (زنجیر، پلاک، گوشواره) کنار «${name}» ایده‌پردازی کنید تا سبد فروش بزرگ‌تر شود.`,
      storeHelpFa: "ایدهٔ ست‌سازی و ارتقا بدون اصرار — مشتری مسیر بعدی را می‌بیند.",
    },
  ];

  if (product.style === "bridal") {
    base[0] = {
      id: "bridal-alt",
      titleFa: "گزینه عروس",
      bodyFa: `نسخهٔ ملایم‌تر یا درخشان‌تر برای «${name}» — نگین و شانه را عوض کنید تا دو سلیقه عروس پوشش داده شود.`,
      storeHelpFa: "جلسهٔ عروس کوتاه‌تر می‌شود؛ دو مسیر واضح روی سینی.",
    };
  }
  if (product.category === "zardis") {
    base[2] = {
      id: "engrave",
      titleFa: "حکاکی و روایت",
      bodyFa: `پشت/سطح پلاک را تصور کنید؛ نام یا نماد را در ذهن حک کنید و ارائه دهید — تفاوت پلاک با شمش را تمرین کنید.`,
      storeHelpFa: "جلوگیری از اشتباه سرمایه‌ای/زیور در توضیح فروش.",
    };
  }
  return base;
}

export function seedFromProduct(product: TrainingProduct): ProductStudioSeed {
  return {
    productSlug: product.slug,
    productNameFa: product.nameFa,
    brandFa: product.brandFa,
    form: inferForm(product),
    karat: product.karat,
    gem: inferGem(product),
    title: `ایده · ${product.nameFa}`,
    accent: product.accent,
    prompts: promptsFor(product),
  };
}

export function brainstormSeedForSlug(slug: string): ProductStudioSeed | null {
  const product = getProduct(slug);
  if (!product) return null;
  return seedFromProduct(product);
}

/** All catalog products as brainstorm entry points for the studio landing */
export function allProductBrainstormSeeds(): ProductStudioSeed[] {
  return trainingProducts.map(seedFromProduct);
}

export function studioHrefForProduct(slug: string): string {
  return `/employee/studio?product=${encodeURIComponent(slug)}`;
}
