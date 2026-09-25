"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Pressable } from "@/components/ui/Pressable";
import {
  GOLD_OPTIONS,
  STUDIO_FORMS,
  STUDIO_GEMS,
  STUDIO_TOOLS,
  type GemId,
  type GoldKarat,
  type StudioFormId,
  type StudioTool,
} from "@/lib/studio/catalog";

const JewelryCanvas = dynamic(
  () =>
    import("@/components/studio/JewelryCanvas").then((m) => m.JewelryCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="jx-studio-canvas jx-studio-canvas--loading">
        <p>آماده‌سازی کارگاه ۳D…</p>
      </div>
    ),
  }
);

export function StudioWorkbench({
  initialForm = "raw",
}: {
  initialForm?: StudioFormId;
}) {
  const [form, setForm] = useState<StudioFormId>(initialForm);
  const [karat, setKarat] = useState<GoldKarat>(18);
  const [tool, setTool] = useState<StudioTool>("sculpt");
  const [gem, setGem] = useState<GemId>("diamond");
  const [presenting, setPresenting] = useState(false);
  const [title, setTitle] = useState("ایدهٔ من");
  const [feedback, setFeedback] = useState("انگشت بکشید — طلا نرم است");
  const [shot, setShot] = useState<string | null>(null);
  const [resetTick, setResetTick] = useState(0);
  const [captureTick, setCaptureTick] = useState(0);

  const onFeedback = useCallback((msg: string) => {
    setFeedback(msg);
  }, []);

  const onCapture = useCallback((dataUrl: string | null) => {
    if (dataUrl) {
      setShot(dataUrl);
      setFeedback("عکس ارائه ذخیره شد — می‌توانید نشان دهید");
    } else {
      setFeedback("عکس‌برداری ممکن نشد");
    }
  }, []);

  const startPresent = () => {
    setTool("present");
    setPresenting(true);
    setFeedback("حالت ارائه — لمس برای خروج");
  };

  const stopPresent = () => {
    setPresenting(false);
    setTool("orbit");
    setFeedback("ارائه تمام شد");
  };

  const formMeta = STUDIO_FORMS.find((f) => f.id === form);

  return (
    <div className={`jx-studio ${presenting ? "is-presenting" : ""}`}>
      {!presenting ? (
        <div className="jx-studio__head">
          <p className="jx-eyebrow">Atelier 3D · لمس با انگشت</p>
          <h2 className="jx-studio__title">کارگاه ایده</h2>
          <p className="jx-studio__lede">
            ماده خام طلا را لمس کنید، شکل دهید، نگین بگذارید و برای هم‌تیمی ارائه
            دهید.
          </p>
          <label className="jx-studio__name">
            <span>نام ایده</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={48}
              placeholder="مثلاً حلقه خورشید آریا"
            />
          </label>
        </div>
      ) : null}

      <div className="jx-studio__stage">
        <JewelryCanvas
          form={form}
          karat={karat}
          tool={presenting ? "orbit" : tool}
          gem={gem}
          presenting={presenting}
          pieceTitle={title}
          resetTick={resetTick}
          captureTick={captureTick}
          onSculptFeedback={onFeedback}
          onCapture={onCapture}
        />
        {presenting ? (
          <button
            type="button"
            className="jx-studio__present-exit tap-react"
            onClick={stopPresent}
          >
            <span className="jx-eyebrow">Presenting</span>
            <strong>{title || "ایدهٔ من"}</strong>
            <span>
              {formMeta?.titleFa} · {karat} عیار — لمس برای بستن
            </span>
          </button>
        ) : (
          <p className="jx-studio__hint" role="status">
            {feedback}
          </p>
        )}
      </div>

      {!presenting ? (
        <>
          <nav className="jx-cats" aria-label="ابزار لمسی">
            {STUDIO_TOOLS.filter((t) => t.id !== "present").map((t) => (
              <Pressable
                key={t.id}
                className={`jx-cat ${tool === t.id ? "is-on" : ""}`}
                feedback={{ label: t.hintFa, tone: "ok" }}
                onPress={() => {
                  setTool(t.id);
                  setFeedback(t.hintFa);
                }}
              >
                {t.titleFa}
              </Pressable>
            ))}
          </nav>

          <section className="jx-studio__panel">
            <div className="jx-section-head">
              <h2>فرم قطعه</h2>
              <p>از ماده خام تا محصول</p>
            </div>
            <div className="jx-studio__chips">
              {STUDIO_FORMS.map((f) => (
                <Pressable
                  key={f.id}
                  className={`jx-studio-chip ${form === f.id ? "is-on" : ""}`}
                  feedback={{ label: f.blurbFa, tone: "info" }}
                  onPress={() => {
                    setForm(f.id);
                    setFeedback(f.blurbFa);
                  }}
                >
                  <strong>{f.titleFa}</strong>
                  <span>{f.blurbFa}</span>
                </Pressable>
              ))}
            </div>
          </section>

          <section className="jx-studio__panel">
            <div className="jx-section-head">
              <h2>عیار طلا</h2>
              <p>رنگ فلز زنده</p>
            </div>
            <div className="jx-brands">
              {GOLD_OPTIONS.map((g) => (
                <Pressable
                  key={g.karat}
                  className={`jx-brand-pill ${karat === g.karat ? "is-gold-on" : ""}`}
                  feedback={{ label: g.titleFa, tone: "ok" }}
                  onPress={() => setKarat(g.karat)}
                >
                  <strong style={{ color: g.hex }}>{g.karat}</strong>
                  <span>{g.titleFa}</span>
                </Pressable>
              ))}
            </div>
          </section>

          <section className="jx-studio__panel">
            <div className="jx-section-head">
              <h2>نگین و سنگ</h2>
              <p>بعد ابزار «نصب نگین» را بزنید</p>
            </div>
            <div className="jx-studio__gems">
              {STUDIO_GEMS.map((g) => (
                <Pressable
                  key={g.id}
                  className={`jx-studio-gem ${gem === g.id ? "is-on" : ""}`}
                  feedback={{ label: g.titleFa, tone: "info" }}
                  onPress={() => {
                    setGem(g.id);
                    setTool("place-gem");
                    setFeedback(`نگین ${g.titleFa} — روی طلا ضربه بزنید`);
                  }}
                >
                  <span
                    className="jx-studio-gem__swatch"
                    style={{ background: g.color }}
                  />
                  <strong>{g.titleFa}</strong>
                </Pressable>
              ))}
            </div>
          </section>

          <div className="jx-studio__actions">
            <Pressable
              className="jx-cta jx-cta--dark tap-react"
              feedback={{ label: "شروع مجدد", tone: "warn" }}
              onPress={() => {
                setResetTick((n) => n + 1);
                setFeedback("ماده خام تازه آماده است");
              }}
            >
              شروع مجدد
            </Pressable>
            <Pressable
              className="jx-cta tap-react"
              feedback={{ label: "عکس ارائه", tone: "ok" }}
              onPress={() => setCaptureTick((n) => n + 1)}
            >
              عکس ایده
            </Pressable>
            <Pressable
              className="jx-cta jx-cta--gold tap-react"
              feedback={{ label: "ارائه", tone: "ok" }}
              onPress={startPresent}
            >
              ارائه ۳D
            </Pressable>
          </div>

          {shot ? (
            <section className="jx-studio__shot">
              <div className="jx-section-head">
                <h2>کارت ارائه</h2>
                <p>{title}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot} alt={title} />
              <a
                className="jx-cta jx-cta--ghost-dark tap-react"
                href={shot}
                download={`${title || "arya-idea"}.png`}
              >
                دانلود تصویر
              </a>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
