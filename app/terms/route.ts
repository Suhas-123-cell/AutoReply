import { legalPage } from "@/lib/legal/page";

export const dynamic = "force-static";

export function GET() {
  return legalPage(
    "Terms of Service",
    `
<p>By connecting an Instagram or Telegram account to this service you agree to the following.</p>

<h2>Your responsibilities</h2>
<ul>
<li>You may only connect accounts you own or are authorised to manage.</li>
<li>Messages you configure must comply with Meta's Platform Terms, Instagram's Community Guidelines, and Telegram's Terms of Service. You are responsible for their content.</li>
<li>You must not use the service to send spam, unsolicited bulk messages, or anything unlawful.</li>
</ul>

<h2>The service</h2>
<ul>
<li>Replies are sent through the official Instagram API and Telegram Bot API. Delivery is subject to those platforms' rate limits, messaging windows, and availability, which are outside our control.</li>
<li>The service is provided as-is, without warranty. The operator is not liable for missed or delayed messages, or for any action a platform takes against a connected account.</li>
<li>The operator may suspend a workspace that violates these terms or a platform's rules.</li>
</ul>

<h2>Billing</h2>
<p>If this instance offers paid plans, they are billed through Stripe on a monthly basis and can be cancelled at any time from the app. Self-hosted instances have no fees.</p>

<h2>Software</h2>
<p>AutoReply is open-source software released under the MIT License. These terms cover use of this hosted instance, not the software itself.</p>
`
  );
}
