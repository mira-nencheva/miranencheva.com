# Drafts

Pages in this folder are **not** built or published. The build only reads
`src/pages/`.

`research.html` is the long research-programme page, written from your 2025
research statement. To publish it later:

1. `mv src/drafts/research.html src/pages/`
2. Add `{ "slug": "research", "label": "Research" }` to the `nav` array in
   `src/site.json`
3. Commit and push
