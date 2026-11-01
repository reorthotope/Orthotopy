import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { CATEGORY_ICONS, DEFAULT_WORKS, GRADIENTS, gradientFor } from "@/lib/works";

const workSchema = z.object({
  title: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(4).max(160),
  kind: z.enum(["Developer", "Creator"]),
  category: z.string().trim().min(2).max(40),
  creator: z.string().trim().min(2).max(60),
});

/**
 * Returns all works. Seeds the sample catalog on an empty database so a
 * fresh clone always shows a lively storefront.
 */
async function listWorks() {
  const count = await db.work.count();
  if (count === 0) {
    await db.work.createMany({ data: DEFAULT_WORKS });
  }
  return db.work.findMany({ orderBy: { createdAt: "desc" } });
}

export async function GET() {
  try {
    const works = await listWorks();
    return NextResponse.json({ works });
  } catch (error) {
    console.error("GET /api/works failed", error);
    return NextResponse.json({ error: "Could not load the catalog." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = workSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid work payload.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const { title, tagline, kind, category, creator } = parsed.data;
    const work = await db.work.create({
      data: {
        title,
        tagline,
        kind,
        category,
        creator,
        icon: CATEGORY_ICONS[category] ?? "sparkles",
        gradient:
          GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)] ?? gradientFor(title),
      },
    });
    return NextResponse.json({ work }, { status: 201 });
  } catch (error) {
    console.error("POST /api/works failed", error);
    return NextResponse.json({ error: "Could not publish the work." }, { status: 500 });
  }
}
