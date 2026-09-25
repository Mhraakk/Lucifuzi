/**
 * Layer 15 — Storage abstractions: Postgres / Vector / Cache / Object
 * In-memory adapters + Supabase-ready interfaces.
 */

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface VectorDoc {
  id: string;
  text: string;
  embedding: number[];
  meta?: Record<string, string>;
}

export interface VectorStore {
  upsert(doc: VectorDoc): Promise<void>;
  search(queryEmbedding: number[], k: number): Promise<Array<VectorDoc & { score: number }>>;
}

export interface ObjectStore {
  put(key: string, bytes: Uint8Array, contentType?: string): Promise<string>;
  get(key: string): Promise<Uint8Array | null>;
}

type CacheEntry = { value: string; expiresAt?: number };

class MemoryKv implements KvStore {
  private map = new Map<string, CacheEntry>();
  async get(key: string) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.map.set(key, {
      value,
      expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : undefined,
    });
  }
  async del(key: string) {
    this.map.delete(key);
  }
}

class MemoryVector implements VectorStore {
  private docs: VectorDoc[] = [];
  async upsert(doc: VectorDoc) {
    const i = this.docs.findIndex((d) => d.id === doc.id);
    if (i >= 0) this.docs[i] = doc;
    else this.docs.push(doc);
  }
  async search(queryEmbedding: number[], k: number) {
    const scored = this.docs.map((d) => ({
      ...d,
      score: cosine(queryEmbedding, d.embedding),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

class MemoryObject implements ObjectStore {
  private blobs = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    this.blobs.set(key, bytes);
    return `mem://${key}`;
  }
  async get(key: string) {
    return this.blobs.get(key) ?? null;
  }
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Tiny bag-of-chars embedding for offline RAG demos */
export function embedText(text: string, dims = 32): number[] {
  const v = new Array(dims).fill(0) as number[];
  const norm = text.toLowerCase();
  for (let i = 0; i < norm.length; i++) {
    const code = norm.charCodeAt(i);
    v[code % dims] += 1;
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}

export type StorageBundle = {
  cache: KvStore;
  vectors: VectorStore;
  objects: ObjectStore;
  driver: "memory" | "supabase";
};

let singleton: StorageBundle | null = null;

export function getStorage(): StorageBundle {
  if (singleton) return singleton;
  const useSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  singleton = {
    cache: new MemoryKv(),
    vectors: new MemoryVector(),
    objects: new MemoryObject(),
    driver: useSupabase ? "supabase" : "memory",
  };
  return singleton;
}

export function resetStorageForTests(): void {
  singleton = {
    cache: new MemoryKv(),
    vectors: new MemoryVector(),
    objects: new MemoryObject(),
    driver: "memory",
  };
}
