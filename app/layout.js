import './globals.css';

export const metadata = {
  title: 'Rekap Bukti Transfer',
  description: 'Upload bukti transfer / QRIS, isi form, download Excel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
