import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import { RegisterSW } from '@/components/RegisterSW';
import { PostHogProvider } from '@/components/PostHogProvider';
import { Toaster } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'CandidateMatch',
  description: 'Match to the right jobs. One profile. One place. Tailored resumes and applications from a single dashboard.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'CandidateMatch',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        <PostHogProvider>
          <RegisterSW />
          <Toaster />
          <ThemeProvider>{children}</ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
