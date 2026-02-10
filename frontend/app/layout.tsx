import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
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
