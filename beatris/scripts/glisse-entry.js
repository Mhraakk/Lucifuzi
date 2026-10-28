// The owner's dashboard only (spec 0053): React, glisse (Apple's Liquid Glass, MIT) and htm (templates without JSX or
// eval), bundled once into public/vendor/glisse/glisse.bundle.js — no runtime dependency, no CDN, like three.bundle.js.
// Rebuild in an empty scratch folder, never inside the repository:
//   npm install --ignore-scripts react@19.3.0 react-dom@19.3.0 glisse@0.4.3 htm@3.1.1 esbuild@0.25.0
//   NODE_PATH=<scratch>/node_modules <scratch>/node_modules/.bin/esbuild scripts/glisse-entry.js --bundle --format=esm \
//     --minify --define:process.env.NODE_ENV='"production"' --legal-comments=none --outfile=public/vendor/glisse/glisse.bundle.js
// Licences: public/vendor/glisse/NOTICE.txt.
import { createElement, Fragment, StrictMode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';

export { Button, Glass, Input, Menu, SearchField, Slider, Switch, TabBar } from 'glisse';
/** jsx`<${Glass} className="x">…</${Glass}>`: htm bound to React. */
export const jsx = htm.bind(createElement);
export { createElement, createRoot, Fragment, StrictMode, memo, useCallback, useEffect, useMemo, useRef, useState };
