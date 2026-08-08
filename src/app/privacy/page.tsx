import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Velo",
  description: "Privacy Policy for the Velo saree order app and messaging features.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-slate-800">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 8 August 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed">
        <p>
          Velo (“we”, “us”) provides order-management and messaging tools for textile
          shops. This policy explains what data we process when you use the Velo web
          app, Android app, and connected messaging channels (including WhatsApp via
          Meta).
        </p>

        <h2 className="pt-2 text-base font-semibold">Data we process</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account data: name, email, phone (if provided), login credentials.</li>
          <li>Business data: orders, customers, products, and settings you enter.</li>
          <li>
            Messaging data: WhatsApp / inbox messages and metadata when you connect a
            channel, processed to show conversations in Velo.
          </li>
          <li>Device and diagnostics: app version, crash/error logs, push tokens.</li>
        </ul>

        <h2 className="pt-2 text-base font-semibold">How we use data</h2>
        <p>
          We use this data to operate Velo, sync orders, deliver push notifications,
          provide the Messages inbox, improve reliability, and meet legal obligations.
          We do not sell personal data.
        </p>

        <h2 className="pt-2 text-base font-semibold">Processors</h2>
        <p>
          We use infrastructure providers such as Supabase (database/auth), Vercel
          (hosting), Google/Firebase (optional push and sign-in), Chatwoot (self-hosted
          messaging backend), and Meta (WhatsApp Cloud API when you connect WhatsApp).
        </p>

        <h2 className="pt-2 text-base font-semibold">Retention</h2>
        <p>
          We keep account and business data while your account is active. You may
          request deletion of your account and associated data by contacting us.
        </p>

        <h2 className="pt-2 text-base font-semibold">Contact</h2>
        <p>
          Questions about privacy:{" "}
          <a className="underline" href="mailto:info@cadancecove.com">
            info@cadancecove.com
          </a>
        </p>
      </section>
    </main>
  );
}
