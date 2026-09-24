"use client";

import {
  ASSESSMENT_LABELS,
  CURRICULUM_DOMAINS,
  PEDAGOGY_PRINCIPLES,
  REGION_LABELS,
  STANDARD_SOURCES,
  type CurriculumDomain,
  type StandardRegion,
} from "@/lib/standards";

const REGION_ORDER: StandardRegion[] = ["us", "ch", "eu"];

function RegionChip({ region }: { region: StandardRegion }) {
  const meta = REGION_LABELS[region];
  return (
    <span
      className="standards-chip"
      style={{ ["--chip-accent" as string]: meta.accent }}
    >
      {meta.fa}
    </span>
  );
}

function DomainCard({ domain }: { domain: CurriculumDomain }) {
  const sources = STANDARD_SOURCES.filter((s) =>
    domain.sourceIds.includes(s.id)
  );
  return (
    <article className="standards-domain">
      <div className="standards-domain__head">
        <p className="standards-domain__code">{domain.code}</p>
        <div className="flex flex-wrap gap-1.5">
          {domain.regions.map((r) => (
            <RegionChip key={r} region={r} />
          ))}
        </div>
      </div>
      <h3 className="standards-domain__title">{domain.titleFa}</h3>
      <p className="standards-domain__summary">{domain.summaryFa}</p>
      <p className="standards-domain__gate">
        ارزیابی: {ASSESSMENT_LABELS[domain.assessment]}
      </p>
      <ul className="standards-domain__outcomes">
        {domain.learningOutcomes.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ul>
      <p className="standards-domain__refs">
        {sources.map((s) => s.shortName).join(" · ")}
      </p>
    </article>
  );
}

/** Domain atlas — US / CH / EU standards. Not a staircase. */
export function StandardsChart({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <section className="standards-atlas animate-in">
      <header className="standards-atlas__intro">
        <p className="atelier-kicker">چارت آموزشی بین‌المللی</p>
        <h2 className="atelier-title !text-xl">
          اطلس شایستگی آمریکا · سوئیس · اروپا
        </h2>
        <p className="atelier-lede">
          چارچوب صلاحیت آریا بر پایه سواد محصول GIA، رویه فروشگاهی JA، دقت
          نشانه‌گذاری سوئیسی، و CIBJO / شفافیت قیمت اروپا — بدون مسیر پلکانی
          اجباری.
        </p>
      </header>

      <div className="standards-regions">
        {REGION_ORDER.map((region) => {
          const meta = REGION_LABELS[region];
          const sources = STANDARD_SOURCES.filter((s) => s.region === region);
          return (
            <div
              key={region}
              className="standards-region"
              style={{ ["--region-accent" as string]: meta.accent }}
            >
              <p className="standards-region__label">
                <span>{meta.fa}</span>
                <em>{meta.en}</em>
              </p>
              <ul>
                {sources.map((s) => (
                  <li key={s.id}>
                    <strong>{s.shortName}</strong>
                    <span>{s.focus}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {!compact ? (
        <>
          <div className="standards-principles">
            {PEDAGOGY_PRINCIPLES.map((p) => (
              <div key={p.id} className="standards-principle">
                <p className="font-bold text-sm">{p.titleFa}</p>
                <p className="muted mt-1 text-xs leading-6">{p.bodyFa}</p>
              </div>
            ))}
          </div>

          <div className="standards-mosaic">
            {CURRICULUM_DOMAINS.map((d) => (
              <DomainCard key={d.id} domain={d} />
            ))}
          </div>
        </>
      ) : (
        <div className="standards-mosaic standards-mosaic--compact">
          {CURRICULUM_DOMAINS.slice(0, 4).map((d) => (
            <DomainCard key={d.id} domain={d} />
          ))}
        </div>
      )}
    </section>
  );
}

export function StandardsBadgeStrip({
  courseId,
}: {
  courseId: string;
}) {
  const domains = CURRICULUM_DOMAINS.filter((d) =>
    d.relatedCourseIds.includes(courseId)
  );
  if (domains.length === 0) return null;
  const regions = Array.from(new Set(domains.flatMap((d) => d.regions)));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {regions.map((r) => (
        <RegionChip key={r} region={r} />
      ))}
      <span className="faint text-[0.65rem]">
        {domains.map((d) => d.code).join(" · ")}
      </span>
    </div>
  );
}
