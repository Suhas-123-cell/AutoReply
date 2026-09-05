import { legalPage } from "@/lib/legal/page";

export const dynamic = "force-static";

// Meta's "Data Deletion Instructions URL" for App Review. Documents the
// in-app path (DELETE /api/mobile/account is what the app calls) and the
// Instagram-side revoke, so a user can remove their data without contacting
// anyone.
export function GET() {
  return legalPage(
    "Data Deletion",
    `
<p>You can remove everything this service holds about you at any time, without contacting anyone.</p>

<h2>If you connected an account (account owner)</h2>
<ol>
<li>Open the AutoReply app and go to <strong>More → Instagram</strong> (or <strong>Telegram</strong>) and tap <strong>Disconnect</strong>. This deletes the stored access token immediately and stops all processing for that account.</li>
<li>To delete your whole account, go to <strong>More → Account → Delete account</strong>. This permanently removes your user, workspace, connected accounts, campaigns, activity logs, tracked links, and click data.</li>
<li>You can also revoke this app's access from Instagram directly: <strong>Instagram → Settings → Website permissions → Apps and websites</strong>, then remove the app. Revoking access invalidates our stored token even if you never open AutoReply again.</li>
</ol>

<h2>If you commented on or messaged a connected account</h2>
<p>The account owner can disconnect their account, which removes the activity log for it. If you want your entry removed, contact the account owner or the operator listed at the top of this page with the Instagram username you used.</p>

<h2>What is deleted</h2>
<p>Deletion is a hard delete from the database, cascading to every related row. Encrypted tokens, logs, and click records are not retained beyond the hosting provider's normal backup window.</p>
`
  );
}
