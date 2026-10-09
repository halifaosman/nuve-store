// Fonts are served from this site (no waiting on Google Fonts before the page can show). Latin set only.
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/dm-serif-display/latin-400.css';
import '@fontsource/dm-serif-display/latin-400-italic.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Nuvé SnapBun | The 5-second bun',
  description: 'Roll, snap, done. A full, sleek bun in about 5 seconds with no pins.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <head>
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
