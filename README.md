# Orthotopy

> Every app in its right place — a free, open app store for indie software.

Orthotopy is an open storefront where indie makers can list their apps without
platform fees, ads or gatekeeping. The catalog lives in the open, downloads go
straight from the maker's own hosting, and publishing is a pull request.

## Status

This is the first public landing page of the store. It includes:

- Hero with live catalog search
- A sample storefront grid with category filters, ratings and demo downloads
- Category browser and a three-step publishing guide
- Light/dark theme, responsive layout, accessible markup

Real app submissions will arrive via pull requests in a future release.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- Lucide icons, Framer Motion, next-themes

## Develop

```bash
bun install
bun run dev    # http://localhost:3000
bun run lint
```

## License

[MIT](./LICENSE)
