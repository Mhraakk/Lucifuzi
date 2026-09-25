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

const TOOL_ICONS: Record<Exclude<StudioTool, "present">, string> = {
  orbit: "O",
  sculpt: "S",
  smooth: "M",
  "place-gem": "G",
};

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

  const onFeedback = useCallback((msg: string) => setFeedback(msg), []);
  const onCapture = useCallback((dataUrl: string | null) => {
    if (dataUrl) {
      setShot(dataUrl);
      setFeedback("کارت ارائه آماده است");
    } else {
      setFeedback("عکس‌برداری ممکن نشد");
    }
  }, []);

  const formMeta = STUDIO_FORMS.find((f) => f.id === form);

  return (
    <div className={`jx-workbench ${presenting ? "is-presenting" : ""}`}>
      {!presenting ? (
        <header className="jx-workbench__head">
          <div>
            <p className="jx-eyebrow">Atelier 3D</p>
            <h2>کارگاه ایده</h2>
          </div>
          <label className="jx-workbench__name">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={48}
              placeholder="نام ایده"
              aria-label="نام ایده"
            />
          </label>
        </header>
      ) : null}

      <div className="jx-workbench__stage">
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
            className="jx-workbench__present-card tap-react"
            onClick={() => {
              setPresenting(false);
              setTool("orbit");
            }}
          >
            <span className="jx-eyebrow">Presenting</span>
            <strong>{title || "ایدهٔ من"}</strong>
            <span>
              {formMeta?.titleFa} · {karat} عیار — لمس برای بستن
            </span>
          </button>
        ) : (
          <p className="jx-workbench__hint" role="status">
            {feedback}
          </p>
        )}
      </div>

      {!presenting ? (
        <>
          {/* Circular tool rail */}
          <nav className="jx-tool-rail" aria-label="ابزار لمسی">
            {(
              STUDIO_TOOLS.filter(
                (t): t is (typeof STUDIO_TOOLS)[number] & {
                  id: Exclude<StudioTool, "present">;
                } => t.id !== "present"
              )
            ).map((t) => (
              <Pressable
                key={t.id}
                className={`jx-tool ${tool === t.id ? "is-on" : ""}`}
                feedback={{ label: t.hintFa, tone: "ok" }}
                onPress={() => {
                  setTool(t.id);
                  setFeedback(t.hintFa);
                }}
              >
                <span className="jx-tool__icon" aria-hidden>
                  {TOOL_ICONS[t.id]}
                </span>
                <span className="jx-tool__label">{t.titleFa}</span>
              </Pressable>
            ))}
          </nav>

          <section className="jx-workbench__block">
            <div className="jx-section-head">
              <h2>فرم قطعه</h2>
              <p>انتخاب قالب</p>
            </div>
            <div className="jx-round-cats__rail">
              {STUDIO_FORMS.map((f) => (
                <Pressable
                  key={f.id}
                  className={`jx-round-cat ${form === f.id ? "is-on" : ""}`}
                  feedback={{ label: f.blurbFa, tone: "info" }}
                  onPress={() => {
                    setForm(f.id);
                    setFeedback(f.blurbFa);
                  }}
                >
                  <span
                    className="jx-round-cat__disc"
                    style={{ ["--jx-accent" as string]: f.accent }}
                    data-form={f.id}
                  />
                  <span className="jx-round-cat__label">{f.titleFa}</span>
                </Pressable>
              ))}
            </div>
          </section>

          <section className="jx-workbench__block">
            <div className="jx-section-head">
              <h2>عیار طلا</h2>
              <p>رنگ فلز</p>
            </div>
            <div className="jx-swatch-row">
              {GOLD_OPTIONS.map((g) => (
                <Pressable
                  key={g.karat}
                  className={`jx-swatch ${karat === g.karat ? "is-on" : ""}`}
                  feedback={{ label: g.titleFa, tone: "ok" }}
                  onPress={() => setKarat(g.karat)}
                >
                  <span
                    className="jx-swatch__dot"
                    style={{ background: g.hex }}
                  />
                  <span>{g.karat}</span>
                </Pressable>
              ))}
            </div>
          </section>

          <section className="jx-workbench__block">
            <div className="jx-section-head">
              <h2>نگین و سنگ</h2>
              <p>سپس «نصب نگین»</p>
            </div>
            <div className="jx-swatch-row jx-swatch-row--gems">
              {STUDIO_GEMS.map((g) => (
                <Pressable
                  key={g.id}
                  className={`jx-swatch ${gem === g.id ? "is-on" : ""}`}
                  feedback={{ label: g.titleFa, tone: "info" }}
                  onPress={() => {
                    setGem(g.id);
                    setTool("place-gem");
                    setFeedback(`نگین ${g.titleFa} — روی طلا ضربه بزنید`);
                  }}
                >
                  <span
                    className="jx-swatch__dot"
                    style={{ background: g.color }}
                  />
                  <span>{g.titleFa}</span>
                </Pressable>
              ))}
            </div>
          </section>

          {/* Jewlly-style dual action bar */}
          <div className="jx-action-bar">
            <Pressable
              className="jx-action-bar__ghost tap-react"
              feedback={{ label: "شروع مجدد", tone: "warn" }}
              onPress={() => {
                setResetTick((n) => n + 1);
                setFeedback("ماده خام تازه آماده است");
              }}
            >
              شروع مجدد
            </Pressable>
            <Pressable
              className="jx-action-bar__ghost tap-react"
              feedback={{ label: "عکس", tone: "ok" }}
              onPress={() => setCaptureTick((n) => n + 1)}
            >
              عکس ایده
            </Pressable>
            <Pressable
              className="jx-action-bar__primary tap-react"
              feedback={{ label: "ارائه", tone: "ok" }}
              onPress={() => {
                setTool("present");
                setPresenting(true);
              }}
            >
              ارائه ۳D
            </Pressable>
          </div>

          {shot ? (
            <section className="jx-soft-shot">
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
