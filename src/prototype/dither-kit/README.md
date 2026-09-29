# Dither Kit (vendored for the prototype)

Copied from https://github.com/Boring-Software-Inc/dither-kit at commit
`1e7faee9aa252e499651e6736ed65f7a07d9a6bd` (MIT licence). Only the `core` and
`bar-chart` registry items are here.

Local changes:

- `bar.tsx`: `process.env.NODE_ENV !== "production"` → `import.meta.env.DEV` for Vite.
- `theme.css`: maps the shadcn colour tokens the kit uses onto MonoCode's tokens.
