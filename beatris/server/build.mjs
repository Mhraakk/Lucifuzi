// نسخه‌ی در حال اجرا (spec 0036): the deploy this process serves. Pages that are already open compare it with the one
// they started with and pick up a new deploy by themselves.
export const BUILD = String(process.env.BEATRIS_BUILD || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || `run-${Date.now().toString(36)}`).slice(0, 40);
