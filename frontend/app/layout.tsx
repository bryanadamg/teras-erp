import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { ToastProvider } from './components/shared/Toast';
import { ConfirmProvider } from './context/ConfirmContext';
import { LanguageProvider } from './context/LanguageContext';
import { Suspense } from 'react';
import { UserProvider } from './context/UserContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { TimezoneProvider } from './context/TimezoneContext';
import QueryProvider from './components/shared/QueryProvider';
import MainLayout from './components/shared/MainLayout';
import GlobalTooltip from './components/shared/GlobalTooltip';
import SWRegister from './components/shared/SWRegister';
import { IBM_Plex_Sans_JP } from 'next/font/google';

// Brand face, used only for the "Terras" wordmark (login screen, docs header).
// Self-hosted by next/font at build time so a floor client with no internet
// still gets it, and `display: swap` + Next's size-adjust metrics keep the
// wordmark from jumping. Exposed as a CSS var rather than applied to <body>:
// the whole UI stays on the system stack.
//
// `preload: false` is load-bearing, not a tweak. The JP cut carries CJK, which
// Google splits into ~120 unicode-range chunks per weight — preloading emitted
// 122 <link rel=preload> tags on every page for glyphs one Latin wordmark will
// never touch. With preload off, unicode-range gating means the browser fetches
// only the single Latin chunk it actually renders.
const displayFont = IBM_Plex_Sans_JP({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  preload: false,
  variable: '--font-display',
});

export const metadata = {
  title: 'Terras ERP',
  description: 'Next-generation modular manufacturing system',
  // iOS home-screen app: launches standalone (no Safari chrome), sets title + status bar
  appleWebApp: {
    capable: true,
    title: 'Terras',
    statusBarStyle: 'black-translucent' as const,
  },
}

export const viewport = {
  themeColor: '#1e293b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning: the boot script below stamps data-ui-scale on
    // <html> before React hydrates, which the server markup can't know about.
    <html lang="en" className={displayFont.variable} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Standard counterpart to appleWebApp.capable above — Next's metadata API doesn't emit this one yet */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Interface scale, applied before first paint so the UI never flashes
            at full size and then snaps down. ThemeContext owns the value after
            hydration; the scale list here mirrors UI_SCALES there. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=Number(localStorage.getItem('ui_scale'));if([70,75,80,90,100,110].indexOf(s)<0)s=80;document.documentElement.setAttribute('data-ui-scale',String(s));}catch(e){document.documentElement.setAttribute('data-ui-scale','80');}})();`,
          }}
        />
      </head>
      <body>
        <SWRegister />
        <QueryProvider>
          <LanguageProvider>
            <ToastProvider>
              <ConfirmProvider>
                  <ThemeProvider>
                  {/* Upgrades every native `title=` in the app to the themed
                      surface, and gives clipped text a hover of its own. Sits
                      under ThemeProvider (it reads the style) and outside the
                      route subtree so it survives navigation. */}
                  <GlobalTooltip />
                  <TimezoneProvider>
                  <UserProvider>
                    <DataProvider>
                      <Suspense fallback={<div className="d-flex justify-content-center align-items-center vh-100 bg-light text-muted fw-bold">LOADING_SYSTEM_RESOURCES...</div>}>
                        <MainLayout>
                          {children}
                        </MainLayout>
                      </Suspense>
                    </DataProvider>
                  </UserProvider>
                  </TimezoneProvider>
                </ThemeProvider>
              </ConfirmProvider>
            </ToastProvider>
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
