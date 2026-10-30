# Third-party notices

## Lucide icons (src/icons.js)

A few icons from lucide-static 0.460.0, copied as path data.

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Wispr Flow connection (bundled into out/main by Vite)

Mufka talks to Wispr Flow's MCP server with the official Model Context
Protocol SDK. These packages are bundled into the main process:

- **@modelcontextprotocol/sdk** 1.31.0 — MIT, Copyright (c) 2024 Anthropic, PBC
- **zod** 4.6.7 — MIT, Copyright (c) 2025 Colin McDonnell
- **ajv** 8.20.0 — MIT, Copyright (c) 2015-2021 Evgeny Poberezkin
- **ajv-formats** 3.0.1 — MIT, Copyright (c) 2020 Evgeny Poberezkin
- **fast-deep-equal** 3.1.3 — MIT, Copyright (c) 2017 Evgeny Poberezkin
- **json-schema-traverse** 1.0.0 — MIT, Copyright (c) 2017 Evgeny Poberezkin
- **pkce-challenge** 5.0.1 — MIT, Copyright (c) 2019
- **eventsource-parser** 3.1.1 — MIT, Copyright (c) 2026 Espen Hovlandsdal
- **fast-uri** 3.1.8 — BSD-3-Clause (text below)

MIT License text for the MIT packages above (each with its own copyright line):

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### fast-uri (BSD-3-Clause)

```
Copyright (c) 2011-2021, Gary Court until https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae
Copyright (c) 2021-present The Fastify team <https://github.com/fastify/fastify#team>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * The names of any contributors may not be used to endorse or promote
      products derived from this software without specific prior written
      permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS AND CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

                                  *   *   *

The complete list of contributors can be found at:
- https://github.com/garycourt/uri-js/graphs/contributors```

## Dataview, Mermaid (bundled into out/renderer by Vite)

Notes' Dataview queries read frontmatter with **yaml** and dates with **luxon**;
Mermaid diagrams are drawn by **mermaid** in the sandbox window. These packages
and the ones they depend on are bundled, under these licenses (each package's
own LICENSE file has the full text and copyright):

- **MIT**: @antfu/install-pkg 2.1.0, @braintree/sanitize-url 7.1.2, @iconify/types 2.0.0, @iconify/utils 3.1.7, @mermaid-js/parser 1.2.1, @upsetjs/venn.js 2.0.0, commander 7.2.0, commander 8.3.0, cose-base 1.0.3, cose-base 2.2.0, cytoscape 3.34.4, cytoscape-cose-bilkent 4.1.0, cytoscape-fcose 2.2.0, dagre-d3-es 7.0.14, dayjs 1.11.23, es-toolkit 1.53.0, fastdom 1.0.12, hachure-fill 0.5.2, iconv-lite 0.6.3, import-meta-resolve 4.2.0, katex 0.16.47, khroma 2.1.0, layout-base 1.0.2, layout-base 2.0.1, lodash-es 4.18.1, luxon 3.7.2, marked 16.4.2, mermaid 11.17.2, package-manager-detector 1.9.0, path-data-parser 0.1.0, points-on-curve 0.2.0, points-on-path 0.2.1, roughjs 4.6.6, safer-buffer 2.1.2, strictdom 1.0.1, stylis 4.4.0, tinyexec 1.3.1, ts-dedent 2.3.0, uuid 14.0.3

- **ISC**: d3 7.9.0, d3-array 3.2.4, d3-axis 3.0.0, d3-brush 3.0.0, d3-chord 3.0.1, d3-color 3.1.0, d3-contour 4.0.2, d3-delaunay 6.0.4, d3-dispatch 3.0.1, d3-drag 3.0.0, d3-dsv 3.0.1, d3-fetch 3.0.1, d3-force 3.0.0, d3-format 3.1.2, d3-geo 3.1.1, d3-hierarchy 3.1.2, d3-interpolate 3.0.1, d3-path 3.1.0, d3-polygon 3.0.1, d3-quadtree 3.0.1, d3-random 3.0.1, d3-scale 4.0.2, d3-scale-chromatic 3.1.0, d3-selection 3.0.0, d3-shape 3.2.0, d3-time 3.1.0, d3-time-format 4.1.0, d3-timer 3.0.1, d3-transition 3.0.1, d3-zoom 3.0.0, delaunator 5.1.0, internmap 2.0.3, internmap 1.0.1, yaml 2.9.1

- **BSD-3-Clause**: d3-array 2.12.1, d3-ease 3.0.1, d3-path 1.0.9, d3-sankey 0.12.3, d3-shape 1.3.7, rw 1.3.3

- **Apache-2.0**: @chevrotain/types 11.1.2

- **(MPL-2.0 OR Apache-2.0)**: dompurify 3.4.17

- **Unlicense**: robust-predicates 3.0.3

## Draw (bundled into out/renderer by Vite)

Draw mode is the **@excalidraw/excalidraw** editor on **react** / **react-dom**;
drawings are stored with **lz-string**. Excalidraw's fonts (Excalifont, Virgil,
Cascadia, Comic Shanns, Assistant, Nunito, Liberation, Lilita) are copied into
the app as the @excalidraw/excalidraw package ships them; they are open-source
fonts under their own licenses, listed with each font in the Excalidraw
repository (github.com/excalidraw/excalidraw). These packages and
the ones they depend on are bundled, under these licenses (each package's own
LICENSE file has the full text and copyright):

- **MIT**: @antfu/install-pkg 2.1.0, @babel/runtime 7.29.10, @braintree/sanitize-url 6.0.2, @braintree/sanitize-url 7.1.2, @excalidraw/excalidraw 0.18.1, @excalidraw/laser-pointer 1.3.1, @excalidraw/markdown-to-text 0.1.2, @excalidraw/mermaid-to-excalidraw 2.2.2, @excalidraw/random-username 1.1.0, @floating-ui/core 1.8.0, @floating-ui/dom 1.8.0, @floating-ui/react-dom 2.1.9, @floating-ui/utils 0.2.12, @iconify/types 2.0.0, @iconify/utils 3.1.7, @mermaid-js/parser 0.6.3, @mermaid-js/parser 1.2.1, @radix-ui/primitive 1.1.1, @radix-ui/primitive 1.0.0, @radix-ui/react-arrow 1.1.2, @radix-ui/react-collection 1.0.1, @radix-ui/react-compose-refs 1.1.1, @radix-ui/react-compose-refs 1.0.0, @radix-ui/react-context 1.1.1, @radix-ui/react-context 1.0.0, @radix-ui/react-direction 1.0.0, @radix-ui/react-dismissable-layer 1.1.5, @radix-ui/react-focus-guards 1.1.1, @radix-ui/react-focus-scope 1.1.2, @radix-ui/react-id 1.1.0, @radix-ui/react-id 1.0.0, @radix-ui/react-popover 1.1.6, @radix-ui/react-popper 1.2.2, @radix-ui/react-portal 1.1.4, @radix-ui/react-presence 1.1.2, @radix-ui/react-presence 1.0.0, @radix-ui/react-primitive 2.0.2, @radix-ui/react-primitive 1.0.1, @radix-ui/react-roving-focus 1.0.2, @radix-ui/react-slot 1.1.2, @radix-ui/react-slot 1.0.1, @radix-ui/react-tabs 1.0.2, @radix-ui/react-use-callback-ref 1.1.0, @radix-ui/react-use-callback-ref 1.0.0, @radix-ui/react-use-controllable-state 1.1.0, @radix-ui/react-use-controllable-state 1.0.0, @radix-ui/react-use-escape-keydown 1.1.0, @radix-ui/react-use-layout-effect 1.1.0, @radix-ui/react-use-layout-effect 1.0.0, @radix-ui/react-use-rect 1.1.0, @radix-ui/react-use-size 1.1.0, @radix-ui/rect 1.1.0, @upsetjs/venn.js 2.0.0, aria-hidden 1.2.6, binary-extensions 2.3.0, braces 3.0.3, canvas-roundrect-polyfill 0.0.1, chevrotain-allstar 0.3.1, chokidar 3.6.0, clsx 1.1.1, commander 7.2.0, commander 8.3.0, cose-base 1.0.3, cose-base 2.2.0, cross-env 7.0.3, cross-spawn 7.0.6, cytoscape 3.34.4, cytoscape-cose-bilkent 4.1.0, cytoscape-fcose 2.2.0, dagre-d3-es 7.0.14, dayjs 1.11.23, detect-node-es 1.1.0, es-toolkit 1.53.0, es6-promise-pool 2.5.0, fastdom 1.0.12, fill-range 7.1.1, fuzzy 0.1.3, get-nonce 1.0.1, glur 1.1.2, hachure-fill 0.5.2, iconv-lite 0.6.3, image-blob-reduce 3.0.1, immutable 4.3.9, import-meta-resolve 4.2.0, is-binary-path 2.1.0, is-extglob 2.1.1, is-glob 4.0.3, is-number 7.0.0, jotai 2.11.0, jotai-scope 0.7.2, katex 0.16.47, khroma 2.1.0, langium 3.3.1, layout-base 1.0.2, layout-base 2.0.1, lodash-es 4.17.21, lodash-es 4.18.1, lodash.debounce 4.0.8, lodash.throttle 4.1.1, lz-string 1.5.0, marked 16.4.2, mermaid 11.17.2, multimath 2.0.0, nanoid 4.0.2, nanoid 3.3.3, normalize-path 3.0.0, object-assign 4.1.1, open-color 1.9.1, package-manager-detector 1.9.0, path-data-parser 0.1.0, path-key 3.1.1, perfect-freehand 1.2.0, pica 7.1.1, picomatch 2.3.2, png-chunk-text 1.0.0, png-chunks-encode 1.0.0, png-chunks-extract 1.0.0, points-on-curve 0.2.0, points-on-curve 1.0.1, points-on-path 0.2.1, react 19.3.1, react-dom 19.3.1, react-remove-scroll 2.7.2, react-remove-scroll-bar 2.3.8, react-style-singleton 2.2.3, readdirp 3.6.0, roughjs 4.6.6, roughjs 4.6.4, safer-buffer 2.1.2, sass 1.51.0, scheduler 0.28.0, shebang-command 2.0.0, shebang-regex 3.0.0, sliced 1.0.1, strictdom 1.0.1, stylis 4.4.0, tinyexec 1.3.1, to-regex-range 5.0.1, ts-dedent 2.3.0, tunnel-rat 0.1.2, use-callback-ref 1.3.3, use-sidecar 1.1.3, use-sync-external-store 1.7.0, uuid 14.0.3, vscode-jsonrpc 8.2.0, vscode-languageserver 9.0.1, vscode-languageserver-protocol 3.17.5, vscode-languageserver-textdocument 1.0.16, vscode-languageserver-types 3.17.5, vscode-uri 3.0.8, webworkify 1.5.0, zustand 4.5.7

- **ISC**: anymatch 3.1.3, d3 7.9.0, d3-array 3.2.4, d3-axis 3.0.0, d3-brush 3.0.0, d3-chord 3.0.1, d3-color 3.1.0, d3-contour 4.0.2, d3-delaunay 6.0.4, d3-dispatch 3.0.1, d3-drag 3.0.0, d3-dsv 3.0.1, d3-fetch 3.0.1, d3-force 3.0.0, d3-format 3.1.2, d3-geo 3.1.1, d3-hierarchy 3.1.2, d3-interpolate 3.0.1, d3-path 3.1.0, d3-polygon 3.0.1, d3-quadtree 3.0.1, d3-random 3.0.1, d3-scale 4.0.2, d3-scale-chromatic 3.1.0, d3-selection 3.0.0, d3-shape 3.2.0, d3-time 3.1.0, d3-time-format 4.1.0, d3-timer 3.0.1, d3-transition 3.0.1, d3-zoom 3.0.0, delaunator 5.1.0, glob-parent 5.1.2, inherits 2.0.4, internmap 2.0.3, internmap 1.0.1, isexe 2.0.0, which 2.0.2

- **Apache-2.0**: @chevrotain/cst-dts-gen 11.0.3, @chevrotain/gast 11.0.3, @chevrotain/regexp-to-ast 11.0.3, @chevrotain/types 11.0.3, @chevrotain/types 11.1.2, @chevrotain/utils 11.0.3, browser-fs-access 0.29.1, chevrotain 11.0.3, crc-32 0.3.0, pwacompat 2.0.17

- **BSD-3-Clause**: d3-array 2.12.1, d3-ease 3.0.1, d3-path 1.0.9, d3-sankey 0.12.3, d3-shape 1.3.7, rw 1.3.3, source-map-js 1.2.2

- **(MPL-2.0 OR Apache-2.0)**: dompurify 3.4.17

- **CC0-1.0**: fractional-indexing 3.2.0

- **(MIT AND Zlib)**: pako 2.0.3

- **Unlicense**: robust-predicates 3.0.3

- **0BSD**: tslib 2.8.1
