import './globals.css';
import { ToastProvider } from './components/Toast';
import { LanguageProvider } from './context/LanguageContext';
import { UserProvider } from './context/UserContext';

export const metadata = {
  title: 'Terras ERP',
  description: 'Next-generation modular manufacturing system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="./vendor/bootstrap/bootstrap.min.css" />
        <link rel="stylesheet" href="./vendor/bootstrap-icons/bootstrap-icons.css" />
      </head>
      <body>
        <LanguageProvider>
          <UserProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </UserProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
