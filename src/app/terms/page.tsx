import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · Velo",
  description: "Terms of Service for the Velo saree order app.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-slate-800">
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 8 August 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed">
        <p>
          By using Velo you agree to these terms. If you use Velo on behalf of a shop
          or business, you confirm you have authority to bind that business.
        </p>

        <h2 className="pt-2 text-base font-semibold">The service</h2>
        <p>
          Velo provides order management, product tools, and optional messaging
          integrations (including WhatsApp through Meta). Features may change as we
          improve the product.
        </p>

        <h2 className="pt-2 text-base font-semibold">Your responsibilities</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Keep login credentials secure and accurate.</li>
          <li>Comply with WhatsApp / Meta policies when connecting messaging.</li>
          <li>Only message customers who have consented where required by law.</li>
          <li>Do not misuse the service for spam, fraud, or illegal activity.</li>
        </ul>

        <h2 className="pt-2 text-base font-semibold">Third-party services</h2>
        <p>
          WhatsApp, Meta, payment providers, and hosting partners have their own
          terms. Connecting those services means you also accept their applicable
          policies.
        </p>

        <h2 className="pt-2 text-base font-semibold">Disclaimer</h2>
        <p>
          Velo is provided “as is”. We are not liable for indirect or consequential
          losses arising from use of the service, to the extent permitted by law.
        </p>

        <h2 className="pt-2 text-base font-semibold">Contact</h2>
        <p>
          <a className="underline" href="mailto:info@cadancecove.com">
            info@cadancecove.com
          </a>
        </p>
      </section>
    </main>
  );
}
