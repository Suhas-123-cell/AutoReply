import Image from "next/image";
import localFont from "next/font/local";
import styles from "./page.module.css";

const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  display: "swap",
  variable: "--font-geist",
});

export const metadata = {
  title: "AutoReply | Instagram comment to DM automation",
  description:
    "Turn Instagram comments into tracked conversations, then record the leads, bookings, and sales each campaign produces.",
};

const contactEmail = process.env.LEGAL_CONTACT_EMAIL?.trim();
const hasContactEmail = Boolean(
  contactEmail && contactEmail !== "you@example.com"
);
const joinHref = hasContactEmail
  ? `mailto:${contactEmail}?subject=${encodeURIComponent(
      "AutoReply private beta"
    )}`
  : null;

function BetaCta({ className }: { className?: string }) {
  if (!joinHref) {
    return (
      <span className={`${className ?? ""} ${styles.disabledButton}`}>
        Beta signup opening soon
      </span>
    );
  }
  return (
    <a className={className} href={joinHref}>
      Join the beta
    </a>
  );
}

export default function HomePage() {
  return (
    <main className={`${geist.variable} ${styles.page}`}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="#top">
          AutoReply
        </a>
        <div className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="/privacy">Privacy</a>
        </div>
      </nav>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Private beta</p>
          <h1>Turn comments into tracked conversations.</h1>
          <p className={styles.heroText}>
            Reply to the right comments, deliver tracked links, and see which
            campaigns produce leads, bookings, and sales.
          </p>
          <div className={styles.actions}>
            <BetaCta className={styles.primaryButton} />
            <a className={styles.secondaryButton} href="#how">
              See how it works
            </a>
          </div>
        </div>
        <div className={styles.heroImage}>
          <Image
            src="/autoreply-creator-hero.png"
            width={1456}
            height={1092}
            sizes="(max-width: 767px) 100vw, 52vw"
            preload
            alt="A creator reviewing responses on a phone at a studio desk"
          />
        </div>
      </section>

      <section className={styles.statement} aria-label="Product status">
        <p>
          Built for creators and small agencies who want focused Instagram
          automation without a heavy CRM.
        </p>
        <p>
          Now recruiting hands-on beta customers. No invented testimonials or
          customer counts.
        </p>
      </section>

      <section className={styles.workflow} id="how">
        <div className={styles.workflowImage}>
          <Image
            src="/autoreply-agency-workflow.png"
            width={1092}
            height={1365}
            sizes="(max-width: 767px) 100vw, 38vw"
            alt="A small social media team reviewing campaign responses together"
          />
        </div>
        <div className={styles.workflowCopy}>
          <h2>A short path from comment to outcome</h2>
          <div className={styles.workflowRows}>
            <article>
              <span>Match</span>
              <h3>Choose the signal</h3>
              <p>
                Trigger on a specific post, any post, the next post, a direct
                message, or a Story reply.
              </p>
            </article>
            <article>
              <span>Reply</span>
              <h3>Send the useful thing</h3>
              <p>
                Deliver a message or tracked link, with an optional opening
                message and follower check.
              </p>
            </article>
            <article>
              <span>Measure</span>
              <h3>Record the real result</h3>
              <p>
                Separate delivered offers from prompts, then record qualified
                leads, bookings, and sales.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.capabilities}>
        <h2>Enough control to run real campaigns</h2>
        <div className={styles.capabilityGrid}>
          <article className={styles.capabilityWide}>
            <h3>Campaign safety</h3>
            <p>
              Paused imports and cross-account clones prevent the wrong post
              from receiving an active automation.
            </p>
          </article>
          <article>
            <h3>Team scopes</h3>
            <p>
              Owners can limit editors and viewers to the client accounts they
              should access.
            </p>
          </article>
          <article className={styles.capabilityTint}>
            <h3>Tracked delivery</h3>
            <p>
              Link previews are filtered from click counts, and failed analytics
              never block the destination.
            </p>
          </article>
          <article className={styles.capabilityDark}>
            <h3>Mobile operations</h3>
            <p>
              Switch workspaces, accept invitations, review activity, and share
              campaign reports from the app.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.pricing} id="pricing">
        <div className={styles.pricingIntro}>
          <h2>Simple limits, stated clearly</h2>
          <p>
            Start free while testing. Paid plans increase message volume and
            connected-account capacity.
          </p>
          <div className={styles.freePlan}>
            <strong>Free</strong>
            <span>500 messages per month</span>
            <span>1 connected account</span>
          </div>
        </div>
        <article className={styles.priceCard}>
          <div>
            <h3>Starter</h3>
            <p>For one creator or a small team.</p>
          </div>
          <strong>
            $19 <span>/ month</span>
          </strong>
          <p>
            25,000 messages per month
            <br />2 connected accounts
          </p>
          <BetaCta className={styles.priceButton} />
        </article>
        <article className={`${styles.priceCard} ${styles.priceCardAccent}`}>
          <div>
            <h3>Agency</h3>
            <p>For teams managing several clients.</p>
          </div>
          <strong>
            $99 <span>/ month</span>
          </strong>
          <p>
            250,000 messages per month
            <br />
            10 connected accounts
          </p>
          <BetaCta className={styles.priceButton} />
        </article>
      </section>

      <section className={styles.trust}>
        <h2>Built with the unglamorous safeguards included</h2>
        <div>
          <p>Signed webhooks and encrypted access tokens</p>
          <p>Workspace and account-level permission checks</p>
          <p>Message-window, deduplication, and rate-limit guards</p>
          <p>Export, deletion, privacy, and data-request routes</p>
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <h2>Bring one campaign you already run.</h2>
        <p>
          Beta customers get direct onboarding and a clear way to report what
          works and what does not.
        </p>
        <BetaCta className={styles.primaryButton} />
      </section>

      <footer className={styles.footer}>
        <span>AutoReply</span>
        <div>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/data-deletion">Data deletion</a>
        </div>
      </footer>
    </main>
  );
}
