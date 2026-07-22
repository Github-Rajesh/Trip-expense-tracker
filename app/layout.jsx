import './globals.css';

export const metadata = {
  title: 'Velvetember Trip Split',
  description: 'A trip expense tracker for five shares with one couple wallet.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
