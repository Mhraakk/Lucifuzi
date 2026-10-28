// دیده‌بان (spec 0053): the platform owner's dashboard — the one page built with React, on glisse's Liquid Glass. The
// bundle (public/vendor/glisse/glisse.bundle.js, scripts/glisse-entry.js) loads only here; the rest of the app stays
// without a framework. React renders into a box of its own, so the router never touches what React owns.
export async function ownerPage(root) {
  const [{ createRoot, jsx }, { OwnerApp }] = await Promise.all([import('/vendor/glisse/glisse.bundle.js'), import('../owner/app.mjs')]);
  const host = document.createElement('div');
  host.className = 'ow-host';
  root.append(host);
  const app = createRoot(host);
  app.render(jsx`<${OwnerApp} />`);
  return () => app.unmount();
}
