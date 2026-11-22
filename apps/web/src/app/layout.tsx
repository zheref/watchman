import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { layoutBootScript } from '@/lib/layout';

// Open Sans (SIL Open Font Licence) is self-hosted at build time as the Segoe-like fallback for
// machines without Segoe UI or Selawik; see FONT_STACK in theme/palette.ts.
// Applies the owner's saved tile layout as CSS before the body is parsed (see lib/layout.ts), so
// a customised home never paints the default order first. Static text: no data, no secrets.
const LAYOUT_BOOT = layoutBootScript();

const openSans = Open_Sans({
  variable: '--font-open-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Watchman',
  description: 'A read-only executive dashboard: attention, flow, spend and metrics at a glance.',
};

export const viewport: Viewport = {
  themeColor: '#141414',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The Metro theme ships one dark scheme; `dark` keeps Chakra's own tokens on it too.
    <html lang="en" className={`${openSans.variable} dark`} style={{ colorScheme: 'dark' }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_BOOT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
