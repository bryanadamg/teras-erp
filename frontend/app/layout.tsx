import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';
import { ToastProvider } from './components/Toast';
import { LanguageProvider } from './context/LanguageContext';
import { Suspense } from 'react';
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
          <ToastProvider>
            <UserProvider>
              <DataProvider>
                <Suspense fallback={<div className="d-flex justify-content-center align-items-center vh-100 bg-light text-muted fw-bold">LOADING_SYSTEM_RESOURCES...</div>}>
                  {children}
                </Suspense>
              </DataProvider>
            </UserProvider>
          </ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
