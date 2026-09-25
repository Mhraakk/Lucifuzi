/**
 * Layer 11 — RAG (platform wrapper over training knowledge index)
 */

import {
  composeRagAnswer,
  retrieveKnowledge,
  type Citation,
} from "@/lib/knowledge/rag";
import { embedText, getStorage } from "@/platform/storage";

export type PlatformRagResult = {
  answer: string;
  citations: Citation[];
  refused: boolean;
  vectorHits: number;
};

export async function platformRagAsk(question: string): Promise<PlatformRagResult> {
  const hits = retrieveKnowledge(question, 5);
  const composed = composeRagAnswer(question, hits);

  // Also index top hit into vector store for memory reuse
  const store = getStorage();
  if (hits[0]) {
    await store.vectors.upsert({
      id: hits[0].chunk.id,
      text: hits[0].chunk.body.slice(0, 500),
      embedding: embedText(hits[0].chunk.body),
      meta: { title: hits[0].chunk.title },
    });
  }
  const vHits = await store.vectors.search(embedText(question), 3);

  return {
    answer: composed.answer,
    citations: composed.citations,
    refused: composed.refused,
    vectorHits: vHits.length,
  };
}
