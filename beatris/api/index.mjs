// Vercel Function: every /api/* request is rewritten here (see vercel.json).
import { openDb, databaseUrl } from '../server/db.mjs';
import { resolveSecret } from '../server/auth.mjs';
import { seedUsers } from '../server/api.mjs';
import { createApiHandler } from '../server/index.mjs';

let ready;
async function init() {
  const url = databaseUrl();
  if (!url) return null;
  const demo = process.env.BEATRIS_DEMO === 'true';
  const db = await openDb({ url });
  await seedUsers(db, process.env, demo);
  return createApiHandler({ db, secret: resolveSecret(), demo });
}

export default async function handler(req, res) {
  ready ??= init().catch((e) => {
    ready = undefined;
    throw e;
  });
  let api;
  try {
    api = await ready;
  } catch (e) {
    console.error('[beatris] init failed', e);
  }
  if (!api) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ error: 'پایگاه داده وصل نیست. در Vercel، Neon Postgres را به پروژه متصل کنید.' }));
  }
  return api(req, res);
}
