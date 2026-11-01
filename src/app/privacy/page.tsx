import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Orthotopy",
  description:
    "How the Orthotopy catalog handles data, cookies and advertising.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What we collect",
    body: [
      "Orthotopy is a static, open catalog. Browsing the site sends no personal data to us: we do not run accounts, analytics or tracking of our own, and we do not build profiles of visitors.",
      "Catalog listings (titles, taglines, creator names and categories) are submitted voluntarily through GitHub and are public by design.",
    ],
  },
  {
    title: "Cookies and advertising",
    body: [
      "This site may display advertising served by Google AdSense. Google and its partners use cookies to serve ads based on your prior visits to this or other websites.",
      "You can opt out of personalized advertising by visiting Google's Ads Settings (adssettings.google.com). Third-party vendors and ad networks may also serve ads on this site; you can visit aboutads.info to opt out of their use of cookies for personalized advertising.",
    ],
  },
  {
    title: "Third-party content",
    body: [
      "Works listed in the catalog are hosted by their creators on their own websites or repositories. When you follow a link out of the catalog, the destination's own privacy policy applies.",
    ],
  },
  {
    title: "Changes and contact",
    body: [
      "This policy may be updated as the project evolves; changes are published in the open repository. For any question, open an issue at github.com/reorthotope/Orthotopy/issues.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: November 2026
      </p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mt-3 text-sm leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-muted-foreground">
        <Link href="/" className="text-emerald-600 hover:underline dark:text-emerald-400">
          ← Back to the catalog
        </Link>
      </p>
    </main>
  );
}
