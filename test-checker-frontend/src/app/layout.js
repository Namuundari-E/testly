import './globals.css'
export const metadata = {
  title: 'Testly',
  description: 'Хиймэл оюун ухаанд суурилсан тест шалгалтын систем',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}