import type { Metadata, Viewport } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import './globals.css';
const title = 'Riyasat · Your estate, in perspective';
const description = 'Property operations and transparent finances for owners, managers and families.';

export const metadata: Metadata = {
  title,
  description,
  applicationName: 'Riyasat',
  appleWebApp: { capable: true, title: 'Riyasat', statusBarStyle: 'default' },
  openGraph: { title, description, siteName: 'Riyasat', type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary', title, description },
};

export const viewport: Viewport = { themeColor: '#173c2e', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
