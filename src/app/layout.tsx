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
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined"
                />
            </head>
            <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
                {children}
            </body>
        </html>
    );
}
