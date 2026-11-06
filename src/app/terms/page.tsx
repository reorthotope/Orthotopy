import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/orthotopy/site-shell";

export const metadata: Metadata = {
  title: "Terms & Conditions — Orthotopy",
  description:
    "The rules for using Orthotopy and for creating a developer account: what you may publish, what we may remove, and what each side promises.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "1. Accepting these terms",
    body: [
      "Welcome to Orthotopy, a free, open catalog where developers and creators list works they host themselves. By browsing the site you agree to these terms; by creating a developer account or publishing a work you accept them on behalf of everything you publish. If you do not agree, please do not use the service.",
    ],
  },
  {
    title: "2. The service",
    body: [
      "Orthotopy lists works — apps, games, extensions and other creations — and links visitors to downloads the developer hosts elsewhere, typically their public GitHub repositories and releases. We provide the storefront, accounts, review and moderation; we do not host your software, and we are not a party to anything between a visitor and a work they download.",
      "The service is provided free of charge, is under active development, and may change: features can be added, adjusted or discontinued. We aim to keep the catalog up, but we cannot promise uninterrupted availability.",
    ],
  },
  {
    title: "3. Developer accounts",
    body: [
      "An account is created exclusively by authorizing your GitHub profile; there is no other sign-up and no password. You may hold one account, and it must be a GitHub account you are allowed to use. You are responsible for everything done through your account, including keeping your session token private — treat it like a password, because to your dashboard it is one.",
      "Accounts are for real people publishing real work. We may suspend or remove an account that breaks these terms, uses the service to distribute harm, or was created to evade a previous removal. You can end this agreement yourself at any time via Settings → Delete account, which erases your profile, works and data as described in the privacy policy.",
    ],
  },
  {
    title: "4. What you may publish",
    body: [
      "Publish only what is yours. Every listing you submit must be a work you created or are licensed to distribute, and you must have the right to use everything shown with it — the title, the description, the screenshots and the linked assets. Submitting someone else's app, game or extension as your own is grounds for immediate removal.",
      "Listings must point to a public GitHub repository and to a download link that serves what the description says it serves. The download must not be disguised, padded, paywalled mid-way or bundled with anything the listing does not clearly disclose. Keep your repository public and your links working while the work is listed; a listing whose links are dead or misleading can be unlisted.",
      "You keep all rights to your work. By publishing, you grant Orthotopy the non-exclusive, worldwide right to display the listing — its title, description, screenshots and links — in the catalog, and you grant visitors the right to download and use the work under whatever license you attach to it in your repository. You can remove a listing at any time by deleting it from your dashboard.",
      "Prohibited content includes, without limitation: malware or anything engineered to harm or deceive; content that is illegal where published or viewed; material that infringes copyright, trademark or privacy; impersonation of another person, product or this site itself; spam, referral-farming or listings that exist mainly to advertise; and sexual content involving minors — reported to the relevant authorities, always.",
    ],
  },
  {
    title: "5. Review and moderation",
    body: [
      "Every submission is reviewed by a human before it appears in the catalog, typically within 24–48 hours. We may reject a submission, or unlist an already-published work, if it breaks these terms, attracts credible reports, or for legal reasons. Where it is useful we will say why — open a support ticket if you want a rejected listing reconsidered.",
      "Visitors can report any listing with the Report control on its page. Every report is read by a human; we may contact the reporting party via the contact details they provided. Reporting in bad faith, at scale, or to take down a competitor is itself a violation.",
    ],
  },
  {
    title: "6. Downloading and using works",
    body: [
      "Listed works are third-party content. Orthotopy reviews listings but cannot test every binary; you download and run other people's software at your own risk, from links that lead off our site to repositories and hosts we do not control. Use current antivirus tooling, check the repository, and report anything that smells wrong — the Report button exists for exactly that.",
    ],
  },
  {
    title: "7. Acceptable use of the site",
    body: [
      "Do not attack the service or its open endpoints: no automated scraping that degrades it, no flooding of reports or tickets, no attempts to bypass rate limits or moderation, and no reverse engineering of access controls to reach other accounts' data. Read-only automation against the public catalog is fine within reason.",
    ],
  },
  {
    title: "8. Disclaimers and liability",
    body: [
      "The service and the site's code are provided “as is”, without warranties of any kind, express or implied — including fitness for a particular purpose. The code is MIT-licensed; nothing in these terms limits the rights that license grants. To the maximum extent permitted by law, Orthotopy's operators are not liable for indirect or consequential damages, lost data or lost profits arising from your use of the service, and their total liability connected to the service is limited to the amount you paid for it — which is nothing.",
    ],
  },
  {
    title: "9. Changes to these terms",
    body: [
      "These terms may change as the service does; the current version always lives on this page, and material changes are announced in the public repository. Continuing to use the site or the account after a change takes effect means you accept it. If a change is unacceptable, your remedy is to delete your account and stop using the service.",
    ],
  },
  {
    title: "10. Contact",
    body: [
      "Questions, takedown notices and anything legal: open an issue at github.com/reorthotope/Orthotopy/issues or use the support form on the site.",
    ],
  },
];

export default function TermsPage() {
  return (
    <SiteShell>
      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms &amp; Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: November 2026 · For developers creating an account, sections 3 and 4 are
          the heart of it.
        </p>
        <div className="mt-10 space-y-10">
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
          <p className="text-sm text-muted-foreground">
            See also the{" "}
            <Link
              href="/privacy"
              className="text-emerald-600 underline underline-offset-4 hover:underline dark:text-emerald-400"
            >
              Privacy Policy
            </Link>{" "}
            for exactly what is stored and how to erase it.
          </p>
        </div>
      </article>
    </SiteShell>
  );
}
