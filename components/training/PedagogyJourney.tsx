"use client";

import { useState } from "react";
import { Pressable } from "@/components/ui/Pressable";
import { MotionEnter } from "@/components/motion/Motion";

const REGIONS = [
  {
    id: "us",
    flag: "US",
    title: "آمریکا",
    principles: [
      {
        t: "سواد محصول (GIA)",
        d: "فلز و سنگ را با زبان دقیق بگویید؛ ادعا بدون مدرک ممنوع است.",
      },
      {
        t: "فروش مشورتی (JA)",
        d: "مناسبت و بودجه اول است — فشار خرید همان‌روز خلاف استاندارد است.",
      },
      {
        t: "افشاگری صادقانه (FTC)",
        d: "عیار، نو/دست‌دوم، و اجرت را شفاف بگویید؛ اغراق جرم اعتماد است.",
      },
      {
        t: "کنترل دوگانه",
        d: "باز/بسته و گاوصندوق همیشه دو نفره؛ ویترین بی‌قفل حتی یک ثانیه هم نه.",
      },
    ],
  },
  {
    id: "ch",
    flag: "CH",
    title: "سوئیس",
    principles: [
      {
        t: "دقت نشانه‌گذاری",
        d: "مهر عیار را خودتان ببینید؛ مثل بوتیک سوئیسی، سند قطعه دقیق است.",
      },
      {
        t: "اسناد خدمات",
        d: "تعمیر = رسید پذیرش + ردیابی + تحویل با هویت‌سنجی.",
      },
      {
        t: "مهمان‌نوازی آرام",
        d: "صدای آرام، حریم خصوصی، فضای بدون ازدحام دور مشتری.",
      },
    ],
  },
  {
    id: "eu",
    flag: "EU",
    title: "اروپا",
    principles: [
      {
        t: "نام‌گذاری CIBJO",
        d: "اصطلاحات جواهر را درست به کار ببرید؛ «الماس» با «زیرکونیا» یکی نیست.",
      },
      {
        t: "شفافیت قیمت",
        d: "مشتری حق دارد اجزای قیمت را بشنود — فلز، اجرت، سود، مالیات.",
      },
      {
        t: "مسئولیت زنجیره (RJC)",
        d: "آگاهی از منبع مسئولانه؛ ادعای اخلاقی بدون سیاست سازمان ممنوع.",
      },
    ],
  },
] as const;

const GATES = [
  {
    id: "know",
    title: "تئوری",
    body: "درس و استاندارد — چشم و استدلال را با مطالعهٔ فرم (میکل‌آنژ) می‌سازد.",
  },
  {
    id: "prac",
    title: "عملی",
    body: "سناریو، فرمول، ویترین — مهارت واقعی با دقت سنگ‌تراشی (برنینی).",
  },
  {
    id: "auth",
    title: "مجوز کار",
    body: "فقط مدیر پس از ارزیابی عملی می‌دهد. AI و آزمون هرگز مجوز نمی‌دهند.",
  },
] as const;

/**
 * Animated US · CH · EU principles + three competency gates — tap to learn.
 */
export function PedagogyJourney() {
  const [region, setRegion] = useState<(typeof REGIONS)[number]["id"]>("us");
  const [openPrinciple, setOpenPrinciple] = useState(0);
  const [gate, setGate] = useState(0);

  const active = REGIONS.find((r) => r.id === region)!;
  const principle = active.principles[openPrinciple] ?? active.principles[0]!;

  return (
    <section className="pedagogy-journey">
      <MotionEnter>
        <p className="atelier-kicker">سه روش · اصول کامل · آتلیه چشم</p>
        <h2 className="page-title !text-xl mb-2">US · CH · EU در عمل</h2>
        <p className="muted text-sm leading-7 mb-4">
          تئوری و عملی تنها منبع آموزش‌اند؛ اصول منطقه‌ای را لمس کنید تا با فیلتر
          بصری گره بخورند.
        </p>
      </MotionEnter>

      <div className="pedagogy-tabs">
        {REGIONS.map((r) => (
          <Pressable
            key={r.id}
            className={`pedagogy-tab ${region === r.id ? "is-on" : ""}`}
            feedback={{ label: `منطقه ${r.title} فعال شد`, tone: "ok" }}
            onPress={() => {
              setRegion(r.id);
              setOpenPrinciple(0);
            }}
          >
            <span className="pedagogy-tab__flag">{r.flag}</span>
            {r.title}
          </Pressable>
        ))}
      </div>

      <div className="pedagogy-principles">
        {active.principles.map((p, i) => (
          <Pressable
            key={p.t}
            className={`pedagogy-chip ${openPrinciple === i ? "is-on" : ""}`}
            feedback={{ label: p.t, tone: "info" }}
            onPress={() => setOpenPrinciple(i)}
          >
            {p.t}
          </Pressable>
        ))}
      </div>

      <div key={`${region}-${openPrinciple}`} className="pedagogy-panel surface p-4 animate-in">
        <p className="font-bold text-sm mb-2">{principle.t}</p>
        <p className="text-sm leading-7">{principle.d}</p>
      </div>

      <div className="mt-5">
        <p className="section-title mb-3">سه لایه صلاحیت</p>
        <div className="pedagogy-gates">
          {GATES.map((g, i) => (
            <Pressable
              key={g.id}
              className={`pedagogy-gate ${gate === i ? "is-on" : ""}`}
              feedback={{
                label:
                  i === 2
                    ? "یادآوری: آزمون ≠ مجوز کار"
                    : `لایه «${g.title}»`,
                tone: i === 2 ? "warn" : "ok",
              }}
              onPress={() => setGate(i)}
            >
              <span className="pedagogy-gate__n">{i + 1}</span>
              <span>
                <strong>{g.title}</strong>
                <em>{g.body}</em>
              </span>
            </Pressable>
          ))}
        </div>
        <p className="muted text-sm leading-7 mt-3 surface p-3">
          {GATES[gate]!.body}
        </p>
      </div>
    </section>
  );
}
