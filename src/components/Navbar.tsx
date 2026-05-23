'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV = [
    { href: '/kds', label: 'KDS', icon: 'point_of_sale' },
    { href: '/mesas', label: 'Mesas', icon: 'table_restaurant' },
    { href: '/caixa', label: 'Caixa', icon: 'point_of_sale' },
    { href: '/catalog', label: 'Catálogo', icon: 'restaurant_menu' },
    { href: '/estoque', label: 'Estoque', icon: 'inventory_2' },
    { href: '/reports', label: 'Relatórios', icon: 'analytics' },
    { href: '/merchants', label: 'Estabelecimentos', icon: 'store' },
    { href: '/settings', label: 'Configurações', icon: 'tune' },
    { href: '/logs', label: 'Registros', icon: 'list_alt' },
];

/**
 * Shell — wrapper de páginas autenticadas. Renderiza sidebar fixed à esquerda
 * (lg+) ou drawer (mobile) + área de conteúdo com o offset correto.
 *
 * Mantemos o nome `Navbar` exportado para evitar mexer em todas as page.tsx.
 * A "Navbar" agora é a Sidebar.
 */
export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);

    async function logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
    }

    return (
        <>
            {/* Top bar mobile (lg-hidden) */}
            <header className="lg:hidden border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-0 z-30">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="p-2 -ml-2 text-slate-600 dark:text-slate-300"
                        aria-label="Abrir menu"
                    >
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                    <Link href="/kds" className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">point_of_sale</span>
                        <span className="font-black tracking-tight">PDV</span>
                        <span className="text-[9px] font-mono bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded uppercase">OD v1.7</span>
                    </Link>
                </div>
            </header>

            {/* Sidebar desktop — classe `app-sidebar` aciona body:has(.app-sidebar)
                no globals.css para empurrar o conteúdo. */}
            <aside className="app-sidebar hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 z-20">
                <SidebarContent pathname={pathname} onLogout={logout} />
            </aside>

            {/* Drawer mobile */}
            {drawerOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setDrawerOpen(false)}
                >
                    <aside
                        className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/10 flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <SidebarContent
                            pathname={pathname}
                            onLogout={logout}
                            onNavigate={() => setDrawerOpen(false)}
                        />
                    </aside>
                </div>
            )}
        </>
    );
}

function SidebarContent({
    pathname, onLogout, onNavigate,
}: {
    pathname: string;
    onLogout: () => void;
    onNavigate?: () => void;
}) {
    return (
        <>
            <div className="px-5 py-5 border-b border-slate-100 dark:border-white/5">
                <Link href="/kds" onClick={onNavigate} className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[28px]">point_of_sale</span>
                    <div className="flex flex-col leading-none">
                        <span className="font-black tracking-tight text-base">PDV</span>
                        <span className="text-[9px] font-mono mt-0.5 text-slate-500 dark:text-slate-400 uppercase">Open Delivery v1.7</span>
                    </div>
                </Link>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
                {NAV.map(item => {
                    const active = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition ${
                                active
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="px-3 py-4 border-t border-slate-100 dark:border-white/5">
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    title="Sair"
                >
                    <span className="material-symbols-outlined text-[20px]">logout</span>
                    Sair
                </button>
            </div>
        </>
    );
}
