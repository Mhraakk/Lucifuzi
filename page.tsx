"use client";

import { useState } from "react";

interface LegalResult {
  caseAnalysis: string;
  successProbability: number;
  legalStrategy: string;
  complaintText: string;
}

function ScoreRing({ value }: { value: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 65 ? "#22c55e" : value >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#1e2235" strokeWidth="10" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
        />
        <text x="65" y="60" textAnchor="middle" fontSize="26" fontWeight="800" fill={color} fontFamily="Vazirmatn,Tahoma,sans-serif">
          {value}%
        </text>
        <text x="65" y="80" textAnchor="middle" fontSize="10" fill="#8892b0" fontFamily="Vazirmatn,Tahoma,sans-serif">
          احتمال موفقیت
        </text>
      </svg>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  delay = 0,
  accent = "#c9a227",
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  delay?: number;
  accent?: string;
}) {
  return (
    <div
      className="animate-fade-up card-hover rounded-2xl p-6"
      style={{
        animationDelay: `${delay}ms`,
        background: "linear-gradient(135deg, #141828 0%, #0f1117 100%)",
        border: "1px solid #1e2235",
        borderTop: `2px solid ${accent}`,
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{icon}</span>
        <h3 className="font-bold text-base" style={{ color: accent }}>
          {title}
        </h3>
      </div>
      <div className="text-sm leading-7 text-slate-300 whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const [story, setStory] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LegalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleAnalyze() {
    if (!story.trim() || story.trim().length < 20) {
      setError("لطفاً داستان حقوقی خود را با جزئیات کافی بنویسید.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "خطا در ارتباط با سرور.");
      } else {
        setResult(data as LegalResult);
      }
    } catch {
      setError("اتصال به سرور برقرار نشد. لطفاً دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (result?.complaintText) {
      navigator.clipboard.writeText(result.complaintText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <main
      className="min-h-screen"
      style={{
        background: "radial-gradient(ellipse at top, #1a1f35 0%, #0a0c14 60%)",
        color: "#e2e8f0",
      }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl border-b"
        style={{ background: "rgba(10,12,20,0.85)", borderColor: "#1e2235" }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
              style={{ background: "linear-gradient(135deg, #c9a227, #8b6914)" }}
            >
              ⚖
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight shimmer-text">
                دستیار حقوقی هوشمند
              </h1>
              <p className="text-xs text-slate-500">مشاوره تخصصی با هوش مصنوعی</p>
            </div>
          </div>
          <div
            className="text-xs px-3 py-1 rounded-full"
            style={{ background: "#0d1219", border: "1px solid #1e2235", color: "#64748b" }}
          >
            GPT-4o
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-10 animate-fade-up">
          <p
            className="inline-block text-xs px-4 py-1.5 rounded-full mb-5 font-medium"
            style={{ background: "rgba(201,162,39,0.12)", color: "#c9a227", border: "1px solid rgba(201,162,39,0.25)" }}
          >
            🏛 تحلیل پرونده‌های حقوقی ایران
          </p>
          <h2
            className="text-3xl font-extrabold mb-3"
            style={{ lineHeight: 1.4 }}
          >
            پرونده‌ات را بنویس،
            <br />
            <span className="shimmer-text">وکیل هوشمند تحلیل می‌کند</span>
          </h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-6">
            داستان حقوقی خود را با جزئیات بنویسید تا هوش مصنوعی پرونده را تحلیل کند، احتمال موفقیت را محاسبه کند و دادخواست آماده کند.
          </p>
        </div>

        {/* Input section */}
        <div
          className="rounded-2xl p-6 mb-6 animate-fade-up"
          style={{
            animationDelay: "100ms",
            background: "linear-gradient(135deg, #141828 0%, #0f1117 100%)",
            border: "1px solid #1e2235",
          }}
        >
          <label className="block text-sm font-semibold text-slate-400 mb-3">
            📝 داستان حقوقی خود را بنویسید
          </label>
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="مثال: من با یک شرکت ساختمانی قرارداد امضا کردم. آنها پروژه را ناقص تحویل دادند و پول را دریافت کردند. اکنون از پاسخگویی فرار می‌کنند..."
            rows={6}
            className="w-full rounded-xl p-4 text-sm leading-8 resize-none outline-none transition-all"
            style={{
              background: "#0a0c14",
              border: "1px solid #1e2235",
              color: "#e2e8f0",
              direction: "rtl",
              fontFamily: "Vazirmatn, Tahoma, sans-serif",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#c9a227";
              e.target.style.boxShadow = "0 0 0 3px rgba(201,162,39,0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#1e2235";
              e.target.style.boxShadow = "none";
            }}
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-600">{story.length} کاراکتر</span>
            <button
              onClick={handleAnalyze}
              disabled={loading || story.trim().length < 20}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
              style={{
                background:
                  loading || story.trim().length < 20
                    ? "#1e2235"
                    : "linear-gradient(135deg, #c9a227, #8b6914)",
                color:
                  loading || story.trim().length < 20 ? "#4a5568" : "#0a0c14",
                cursor:
                  loading || story.trim().length < 20
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {loading ? (
                <>
                  <span
                    className="inline-block w-4 h-4 rounded-full border-2"
                    style={{
                      borderColor: "#4a5568",
                      borderTopColor: "#c9a227",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  در حال تحلیل...
                </>
              ) : (
                <>⚖ تحلیل پرونده</>
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded-xl p-4 mb-6 text-sm animate-fade-up"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-5">
            {/* Probability */}
            <div
              className="animate-fade-up rounded-2xl p-6 card-hover"
              style={{
                background: "linear-gradient(135deg, #141828 0%, #0f1117 100%)",
                border: "1px solid #1e2235",
                borderTop: "2px solid #c9a227",
              }}
            >
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ScoreRing value={result.successProbability} />
                <div className="text-center sm:text-right">
                  <h3 className="font-bold text-base mb-2" style={{ color: "#c9a227" }}>
                    📊 نتیجه‌گیری کلی
                  </h3>
                  <p className="text-sm text-slate-400 leading-7">
                    {result.successProbability >= 65
                      ? "پرونده شما شانس موفقیت بالایی دارد. با انتخاب استراتژی صحیح می‌توانید نتیجه خوبی بگیرید."
                      : result.successProbability >= 40
                      ? "پرونده شما در حد متوسط قرار دارد. نیاز به بررسی دقیق‌تر و جمع‌آوری مدارک بیشتر دارید."
                      : "پرونده با چالش‌های جدی مواجه است. مشاوره حضوری با وکیل ضروری است."}
                  </p>
                </div>
              </div>
            </div>

            <Card title="تحلیل پرونده" icon="🔍" delay={100}>
              {result.caseAnalysis}
            </Card>

            <Card title="بهترین استراتژی حقوقی" icon="🎯" delay={200} accent="#22c55e">
              {result.legalStrategy}
            </Card>

            {/* Complaint */}
            <div
              className="animate-fade-up card-hover rounded-2xl p-6"
              style={{
                animationDelay: "300ms",
                background: "linear-gradient(135deg, #141828 0%, #0f1117 100%)",
                border: "1px solid #1e2235",
                borderTop: "2px solid #6366f1",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📄</span>
                  <h3 className="font-bold text-base" style={{ color: "#6366f1" }}>
                    متن دادخواست آماده
                  </h3>
                </div>
                <button
                  onClick={handleCopy}
                  className="text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: copied ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.12)",
                    border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(99,102,241,0.3)"}`,
                    color: copied ? "#86efac" : "#a5b4fc",
                    cursor: "pointer",
                  }}
                >
                  {copied ? "✓ کپی شد" : "📋 کپی"}
                </button>
              </div>
              <div
                className="rounded-xl p-4 text-sm leading-8 text-slate-300 whitespace-pre-wrap"
                style={{ background: "#0a0c14", border: "1px solid #1e2235" }}
              >
                {result.complaintText}
              </div>
            </div>

            {/* Disclaimer */}
            <p
              className="text-center text-xs animate-fade-up"
              style={{ animationDelay: "400ms", color: "#374151" }}
            >
              ⚖️ این تحلیل جنبه اطلاع‌رسانی دارد و جایگزین مشاوره وکیل نیست.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
