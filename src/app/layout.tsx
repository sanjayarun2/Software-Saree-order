import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast-context";
import { SearchProvider } from "@/lib/search-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/AppShell";
import { SplashController } from "@/lib/SplashController";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Saree Order Book",
  description: "Book and manage saree orders",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <ErrorBoundary>
          <AuthProvider>
            <SplashController>
              <ToastProvider>
                <SearchProvider>
                  <AppShell>{children}</AppShell>
                </SearchProvider>
              </ToastProvider>
            </SplashController>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
