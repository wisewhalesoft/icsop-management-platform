# Font asset licensing

## NotoSansTC-Regular.ttf

- **Font**: Noto Sans TC (Traditional Chinese), Regular weight.
- **Source**: Google Fonts (`https://fonts.google.com/noto/specimen/Noto+Sans+TC`).
- **License**: SIL Open Font License, Version 1.1 (OFL-1.1) — a permissive,
  redistribution-friendly license. Full text: `https://openfontlicense.org/`.
- **Copyright**: Copyright 2014-2021 Adobe (`https://www.adobe.com/`), with
  Reserved Font Name "Source" — released by Google/Adobe under OFL-1.1.

### Why bundled here

pdf-lib's built-in `StandardFonts.Helvetica` uses WinAnsi encoding and cannot
encode CJK code points; real Chinese watermark / tree-diagram text throws
`WinAnsi cannot encode`. This TTF is embedded (subset) via `@pdf-lib/fontkit`
so F020 watermark burning and F036 tree-diagram PDF export render Chinese
correctly. See `backend/src/public/fonts/cjk-font.ts`.

### Deployment note

The loader (`cjk-font.ts`) resolves this asset relative to the `backend/` root
(`assets/fonts/`). Production packaging must ship the `backend/assets/` directory
alongside the compiled `dist/` output. If the asset is absent at runtime, the
burners degrade gracefully to Helvetica + ASCII-safe substitution (Chinese
becomes `?`) and never throw.
