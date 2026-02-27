import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { ToastProvider } from './components/Toast';
import { LanguageProvider } from './context/LanguageContext';
import { UserProvider } from './context/UserContext';
import { DataProvider } from './context/DataContext';

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
            <DataProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </DataProvider>
          </UserProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
