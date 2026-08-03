import './globals.css';

export const metadata = {
  title: 'Finanzas',
  description: 'App de finanzas personales — Personal y Hogar',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen text-gray-900">{children}</body>
    </html>
  );
}
