import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'PDV — Open Delivery v1.7',
    description: 'Software Service Open Delivery v1.7 (Abrasel) — recebe pedidos via webhook HMAC e gerencia o ciclo de vida no KDS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" className="dark">
            <head>
                {/* Pré-conexão para tirar o cold-start da requisição de fontes. */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                {/* Inter (body) + Plus Jakarta Sans (display) + JetBrains Mono (mono). */}
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
                />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined"
                />
            </head>
            <body className="text-slate-900 dark:text-slate-100 min-h-screen">
                {children}
            </body>
        </html>
    );
}
