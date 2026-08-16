import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AutoReply",
  description: "AutoReply — get the app on iOS or Android.",
  robots: { index: false, follow: false },
};

// The dashboard and marketing site were removed; the mobile app (iOS/Android)
// is now the only client of the app/api/* backend. This root page is a bare
// stub so "/" doesn't 404 for compliance reviewers or stray links — not a
// product surface.
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
      <div>
        <h1 className="text-lg font-semibold">AutoReply</h1>
        <p className="mt-2 text-sm text-muted">
          AutoReply is a mobile app. Get it on iOS or Android.
        </p>
      </div>
    </main>
  );
}
