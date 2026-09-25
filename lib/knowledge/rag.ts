/**
 * RAG over Arya approved knowledge — lessons, SOPs, standards atlas.
 * Offline-safe retrieval; citations are first-class.
 */

import {
  courses,
  lessonContents,
  lessons,
  sopVersions,
  sops,
} from "@/lib/demo-data";
import {
  CURRICULUM_DOMAINS,
  PEDAGOGY_PRINCIPLES,
  STANDARD_SOURCES,
} from "@/lib/standards";

export type KnowledgeSourceKind = "lesson" | "sop" | "standard" | "pedagogy";

export type KnowledgeChunk = {
  id: string;
  kind: KnowledgeSourceKind;
  title: string;
  body: string;
  tokens: string[];
  lessonId?: string;
  courseId?: string;
  sopId?: string;
  domainCode?: string;
  href?: string;
};

export type Citation = {
  kind: KnowledgeSourceKind;
  title: string;
  id: string;
  href?: string;
  lessonId?: string;
  sopId?: string;
  courseId?: string;
  domainCode?: string;
};

export type RetrievalHit = {
  chunk: KnowledgeChunk;
  score: number;
};

let cachedIndex: KnowledgeChunk[] | null = null;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‌‍]/g, " ")
    .replace(/[^\u0600-\u06FFa-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1);
}

function uniqueTokens(parts: string[]): string[] {
  return Array.from(new Set(parts.flatMap(tokenize)));
}

export function buildKnowledgeIndex(): KnowledgeChunk[] {
  if (cachedIndex) return cachedIndex;
  const chunks: KnowledgeChunk[] = [];

  for (const lesson of lessons) {
    const content = lessonContents.find((c) => c.lessonId === lesson.id);
    const course = courses.find((c) => c.id === lesson.courseId);
    const blockText = (content?.blocks ?? [])
      .map((b) =>
        [b.title, b.body, ...(b.items ?? [])].filter(Boolean).join("\n")
      )
      .join("\n");
    const body = [lesson.summary, blockText].filter(Boolean).join("\n").trim();
    if (!body) continue;
    chunks.push({
      id: `chunk_les_${lesson.id}`,
      kind: "lesson",
      title: `${course?.title ?? "دوره"} · ${lesson.title}`,
      body,
      tokens: uniqueTokens([lesson.title, lesson.summary, blockText]),
      lessonId: lesson.id,
      courseId: lesson.courseId,
      href: `/employee/lessons/${lesson.id}`,
    });
  }

  for (const sop of sops) {
    const version = sopVersions.find((v) => v.id === sop.currentVersionId);
    if (!version) continue;
    const body = [
      version.summary,
      ...version.steps,
      ...version.warnings.map((w) => `هشدار: ${w}`),
    ].join("\n");
    chunks.push({
      id: `chunk_sop_${sop.id}`,
      kind: "sop",
      title: sop.title,
      body,
      tokens: uniqueTokens([sop.title, sop.category, body]),
      sopId: sop.id,
      href: `/employee/sop/${sop.id}`,
    });
  }

  for (const domain of CURRICULUM_DOMAINS) {
    const body = [
      domain.summaryFa,
      ...domain.learningOutcomes,
      `ارزیابی: ${domain.assessment}`,
    ].join("\n");
    chunks.push({
      id: `chunk_dom_${domain.id}`,
      kind: "standard",
      title: `${domain.code} · ${domain.titleFa}`,
      body,
      tokens: uniqueTokens([domain.code, domain.titleFa, body]),
      domainCode: domain.code,
      href: "/employee/learn",
    });
  }

  for (const src of STANDARD_SOURCES) {
    chunks.push({
      id: `chunk_src_${src.id}`,
      kind: "standard",
      title: `${src.shortName} · ${src.titleFa}`,
      body: src.focus,
      tokens: uniqueTokens([src.shortName, src.titleFa, src.focus]),
      href: "/employee/learn",
    });
  }

  for (const p of PEDAGOGY_PRINCIPLES) {
    chunks.push({
      id: `chunk_ped_${p.id}`,
      kind: "pedagogy",
      title: p.titleFa,
      body: p.bodyFa,
      tokens: uniqueTokens([p.titleFa, p.bodyFa]),
      href: "/employee/skills",
    });
  }

  cachedIndex = chunks;
  return chunks;
}

export function retrieveKnowledge(
  query: string,
  limit = 5
): RetrievalHit[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const index = buildKnowledgeIndex();

  const scored = index
    .map((chunk) => {
      let score = 0;
      const hay = normalize(`${chunk.title} ${chunk.body}`);
      for (const t of qTokens) {
        if (chunk.tokens.includes(t)) score += 3;
        else if (hay.includes(t)) score += 1;
      }
      // Phrase bonus for short retail queries
      if (qTokens.length >= 2) {
        const phrase = qTokens.slice(0, 3).join(" ");
        if (hay.includes(phrase)) score += 4;
      }
      return { chunk, score };
    })
    .filter((h) => h.score >= 2)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

export function citationsFromHits(hits: RetrievalHit[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const { chunk } of hits) {
    const key = chunk.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: chunk.kind,
      title: chunk.title,
      id: chunk.id,
      href: chunk.href,
      lessonId: chunk.lessonId,
      sopId: chunk.sopId,
      courseId: chunk.courseId,
      domainCode: chunk.domainCode,
    });
  }
  return out;
}

export function buildGroundedContext(hits: RetrievalHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .map(
      (h, i) =>
        `[منبع ${i + 1}: ${h.chunk.title}]\n${h.chunk.body.slice(0, 900)}`
    )
    .join("\n\n");
}

/** Compose an offline answer strictly from retrieved chunks */
export function composeRagAnswer(
  query: string,
  hits: RetrievalHit[]
): { answer: string; citations: Citation[]; refused: boolean } {
  const citations = citationsFromHits(hits);
  if (hits.length === 0) {
    return {
      refused: true,
      citations: [],
      answer:
        "این مورد در دانش‌نامه تأییدشده (درس‌ها، SOP، اطلس استاندارد) پیدا نشد. سیاست شعبه را از خودم نسازید — به مدیر یا دستورالعمل مرتبط مراجعه کنید.",
    };
  }

  const top = hits[0]!.chunk;
  const extras = hits.slice(1, 3).map((h) => h.chunk.title);
  const answerParts = [
    top.body.split("\n").filter(Boolean).slice(0, 4).join(" "),
  ];
  if (extras.length > 0) {
    answerParts.push(
      `\n\nمنابع مرتبط: ${[top.title, ...extras].join(" · ")}`
    );
  } else {
    answerParts.push(`\n\nمنبع: ${top.title}`);
  }

  // Quick floor mode hints for common intents
  const q = normalize(query);
  if (q.includes("عیار") || q.includes("750") || q.includes("۷۵۰")) {
    answerParts.unshift(
      "پاسخ سریع ویترین: عیار را فقط پس از دیدن مهر/پلاک اعلام کنید؛ ۷۵۰ یعنی ۱۸ عیار (۷۵٪ طلا خالص)."
    );
  } else if (q.includes("قیمت") || q.includes("اجرت") || q.includes("گرون")) {
    answerParts.unshift(
      "پاسخ سریع ویترین: اجزای قیمت (فلز · اجرت · سود · مالیات) را آرام توضیح دهید؛ مشتری را بابت بودجه شرمسار نکنید."
    );
  }

  return {
    refused: false,
    citations,
    answer: answerParts.join("\n"),
  };
}
