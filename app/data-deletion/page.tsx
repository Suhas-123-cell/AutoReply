import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Data Deletion - AutoReply",
  description:
    "How AutoReply customers can disconnect Instagram and request account or campaign data deletion.",
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      title="Data Deletion"
      description="Use this page for Meta App Review and customer requests about removing AutoReply account, workspace, Instagram, and campaign data."
      updatedAt="May 24, 2026"
    >
      <section>
        <h2 className="text-xl font-bold text-white">Disconnect Instagram</h2>
        <p className="mt-3">
          Sign in, open Settings, and select Disconnect. This removes the stored
          Instagram connection token and stops campaigns from sending private
          replies for that workspace.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Delete Your Account</h2>
        <p className="mt-3">
          On the AutoReply mobile app, open Settings → Account → Delete
          Account. This immediately and permanently deletes your user
          account, including any workspace you own that has no other
          members, all connected Instagram accounts, campaigns, logs, and
          diagnostic data tied to it. If you own a workspace with other
          members, you will be asked to transfer ownership first, so a
          teammate&apos;s access and data are never destroyed by one
          person&apos;s account deletion.
        </p>
        <p className="mt-3">
          On the web dashboard, or for workspace data not covered by the
          in-app deletion above, contact support from the email address used
          to sign in. Include the workspace name and the Instagram username
          connected to the workspace.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-white">Verification</h2>
        <p className="mt-3">
          We may ask you to verify control of the email address or connected
          business account before deleting data. Deletion requests are processed
          as quickly as practical unless retention is required for legal,
          billing, fraud prevention, or security reasons.
        </p>
      </section>
    </LegalShell>
  );
}
