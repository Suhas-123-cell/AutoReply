// The backend is API-only. Next.js still requires a root layout for the few
// plain-HTML routes (privacy, terms, data-deletion, tracked-link redirects),
// which render their own documents, so this stays as bare as it can be.
export const metadata = {
  title: "AutoReply",
  description: "Instagram and Telegram comment-to-DM automation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
