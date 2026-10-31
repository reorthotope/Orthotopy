# Orthotopy

> Every work in its right place — a free, open publishing home for developers and creators.

Orthotopy is an open platform where developers and creators publish their works —
apps, tools, games, music, design, writing — without platform fees, ads or
gatekeeping. Works are hosted by their makers, listed in the open catalog, and
publishing is a pull request (or the built-in publisher on the live demo).

## Status

This is the first working version of the platform:

- Live catalog backed by SQLite (Prisma ORM), seeded with sample works on first load
- **Publish flow**: a form that writes to the catalog through `POST /api/works`
- Search, publisher-kind filters (Developer / Creator) and category filters
- Creator profiles derived from the catalog
- Light/dark theme, responsive layout, accessible markup

## API

| Method | Route         | Description                                   |
| ------ | ------------- | --------------------------------------------- |
| GET    | `/api/works`  | List all works (auto-seeds the sample catalog) |
| POST   | `/api/works`  | Publish a new work (validated with zod)        |

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- [Prisma](https://www.prisma.io) + SQLite
- [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- TanStack Query, Lucide icons, Framer Motion, next-themes

## Develop

```bash
bun install
bun run db:push   # sync the Prisma schema to SQLite
bun run dev       # http://localhost:3000
bun run lint
```

## License

[MIT](./LICENSE)
