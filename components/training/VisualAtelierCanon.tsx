"use client";

import Link from "next/link";
import { useState } from "react";
import { Pressable } from "@/components/ui/Pressable";
import { MotionEnter } from "@/components/motion/Motion";
import {
  SCULPTURE_WORKS,
  TRAINING_GENRES,
  VISUAL_FACULTIES,
} from "@/lib/atelier/sculptures";

/**
 * Theory + Practice as the sole training source-of-truth,
 * filtered through Italian sculptural eye-training
 * (sight, visual reasoning, aesthetic judgment, precision, craft).
 */
export function VisualAtelierCanon() {
  const [genre, setGenre] = useState<(typeof TRAINING_GENRES)[number]["id"]>(
    "theory"
  );
  const [faculty, setFaculty] = useState(0);

  const active = TRAINING_GENRES.find((g) => g.id === genre)!;
  const work = SCULPTURE_WORKS[active.sculpture]!;
  const skill = VISUAL_FACULTIES[faculty] ?? VISUAL_FACULTIES[0]!;

  return (
    <section className="visual-canon animate-in">
      <MotionEnter>
        <p className="atelier-kicker">آتلیه چشم · میکل‌آنژ تا برنینی</p>
        <h2 className="page-title !text-xl mb-2">تئوری و عملی — تنها منبع آموزش</h2>
        <p className="muted text-sm leading-7 mb-4">
          کارکنان از فیلتر این اپ عبور می‌کنند تا بینایی، استدلال بصری،
          زیبایی‌سنجی، دقت و مهارت لمسی‌شان آزموده و افزایش یابد — نه فقط نمرهٔ آزمون.
        </p>
      </MotionEnter>

      <div className="visual-canon__genres">
        {TRAINING_GENRES.map((g) => {
          const sc = SCULPTURE_WORKS[g.sculpture]!;
          return (
            <Pressable
              key={g.id}
              className={`visual-canon__genre ${genre === g.id ? "is-on" : ""}`}
              feedback={{
                label: g.id === "theory" ? "ژانر تئوری فعال" : "ژانر عملی فعال",
                tone: "ok",
              }}
              onPress={() => setGenre(g.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sc.src} alt="" loading="lazy" />
              <span>
                <strong>{g.title}</strong>
                <em>{sc.artist}</em>
              </span>
            </Pressable>
          );
        })}
      </div>

      <div key={genre} className="visual-canon__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={work.src} alt="" className="visual-canon__marble" />
        <div className="visual-canon__veil" aria-hidden />
        <div className="visual-canon__copy">
          <p className="atelier-kicker">
            {work.artist} · {work.school}
          </p>
          <p className="visual-canon__title">{work.title}</p>
          <p className="visual-canon__body">{active.body}</p>
          <p className="visual-canon__trains">می‌پرورد: {work.trains}</p>
          <Link href={active.href} className="btn btn-primary tap-react mt-3 !min-h-11 text-sm">
            ورود به {active.title}
          </Link>
        </div>
      </div>

      <p className="section-title mb-3 mt-5">پنج قوهٔ بصری</p>
      <div className="visual-canon__faculties">
        {VISUAL_FACULTIES.map((f, i) => (
          <Pressable
            key={f.id}
            className={`visual-canon__chip ${faculty === i ? "is-on" : ""}`}
            feedback={{ label: f.title, tone: "info" }}
            onPress={() => setFaculty(i)}
          >
            {f.title}
          </Pressable>
        ))}
      </div>
      <div key={skill.id} className="surface p-4 animate-in">
        <p className="font-bold text-sm mb-2">{skill.title}</p>
        <p className="text-sm leading-7">{skill.body}</p>
      </div>
    </section>
  );
}
