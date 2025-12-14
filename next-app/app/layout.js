import './globals.css'

export const metadata = {
  title: 'Chameleon Game',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
