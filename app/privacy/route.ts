import { legalPage } from "@/lib/legal/page";

export const dynamic = "force-static";

export function GET() {
  return legalPage(
    "Privacy Policy",
    `
<p>AutoReply sends automated replies on Instagram and Telegram on behalf of the account owners who connect their accounts to this service. This page explains what data is processed and why.</p>

<h2>Data we store about account owners</h2>
<ul>
<li>Your sign-in identity (email address, phone number, or Google account ID) and workspace membership.</li>
<li>Instagram access tokens and Telegram bot tokens, encrypted at rest with AES-256-GCM, used only to call the official Instagram API and Telegram Bot API on your behalf.</li>
<li>The campaigns you create: keywords, messages, links, and the posts they attach to.</li>
<li>A push-notification device token if you enable notifications in the app.</li>
</ul>

<h2>Data we process about people who interact with a connected account</h2>
<ul>
<li>The public comment or direct message text that matched a campaign keyword, the sender's Instagram-scoped user ID and username, and the delivery status of the reply. This is kept as an activity log so the account owner can see what was sent.</li>
<li>Whether the sender follows the connected account, when a campaign requires a follow before sending a link. This is read from Instagram's <code>is_user_follow_business</code> flag and is not stored.</li>
<li>Click events on tracked links: a hashed IP address, user agent, and referrer. The raw IP address is never stored.</li>
</ul>

<h2>What we do not do</h2>
<ul>
<li>We never scrape Instagram, automate a browser, or ask for an Instagram password. All access goes through Meta's official Instagram API with permissions you grant on Meta's consent screen.</li>
<li>We do not sell or share personal data with third parties. Data leaves this service only to Meta, Telegram, and the infrastructure providers hosting it.</li>
<li>We only act on comments on the connected account's own posts, and on messages sent directly to the connected account.</li>
</ul>

<h2>Retention and deletion</h2>
<p>Data is kept while the account owner's workspace exists. Disconnecting an Instagram account deletes its token and stops all processing for it. Deleting your account in the app removes your user, workspace, connected accounts, campaigns, and logs. See the <a href="/data-deletion">data deletion</a> page for the exact steps.</p>

<h2>Contact</h2>
<p>Questions about this policy go to the operator listed at the top of this page.</p>
`
  );
}
