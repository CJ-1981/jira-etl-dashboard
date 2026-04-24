import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jira ETL Dashboard - Metabase KPI Engine",
  description: "Jira ETL tool with custom KPI calculation engine, German holiday awareness, and Metabase dashboard integration via extension plugins.",
  keywords: ["Jira", "ETL", "Metabase", "KPI", "Dashboard", "German Holidays", "Plugin System", "SLA"],
  authors: [{ name: "Jira ETL Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Jira ETL Dashboard",
    description: "Jira ETL tool with custom KPI calculation and Metabase integration",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jira ETL Dashboard",
    description: "Jira ETL tool with custom KPI calculation and Metabase integration",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="min-h-screen bg-gray-50 dark:bg-slate-950 dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 bg-fixed">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const theme = localStorage.getItem('jira-etl-theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          } catch(e){}
        `}} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased text-slate-900 dark:text-slate-100 min-h-screen`}
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
