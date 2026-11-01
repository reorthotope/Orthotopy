"use client";

import { createContext, useContext, useState } from "react";
import { Footer } from "./footer";
import { Navbar } from "./navbar";
import { PublishDialog } from "./publish-dialog";

/**
 * Shared chrome for every route: navbar, footer and the publish dialog.
 * Pages call `usePublish()` to open the dialog from any CTA.
 */
const PublishContext = createContext<() => void>(() => {});

export const usePublish = () => useContext(PublishContext);

export function SiteShell({ children }: { children: React.ReactNode }) {
  const [publishOpen, setPublishOpen] = useState(false);
  const openPublish = () => setPublishOpen(true);

  return (
    <PublishContext.Provider value={openPublish}>
      <div id="top" className="flex min-h-screen flex-col bg-background text-foreground">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
      </div>
    </PublishContext.Provider>
  );
}
