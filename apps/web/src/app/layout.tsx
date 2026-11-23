import type { Metadata, Viewport } from 'next';
import { Open_Sans } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { layoutBootScript } from '@/lib/layout';
import { refreshBootScript } from '@/lib/refresh';

// Two inline scripts, static text with no data and no secrets, that run while the HTML is parsed
// and need no hydration: the owner's saved tile layout applied as CSS before the first paint
// (lib/layout.ts), and the idle-aware self-refresh that keeps an open page under an hour old
// (lib/refresh.ts).
const BOOT = layoutBootScript() + refreshBootScript();

// Open Sans (SIL Open Font Licence) is self-hosted at build time as the Segoe-like fallback for
// machines without Segoe UI or Selawik; see FONT_STACK in theme/palette.ts.
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
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
