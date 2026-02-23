import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import { RegisterSW } from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Orion CMOS',
  description: 'AI-powered resume generation and job matching platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Orion CMOS',
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body>
        <RegisterSW />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
