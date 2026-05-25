'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV_GROUPS: Array<{
    label?: string;
    items: Array<{ href: string; label: string; icon: string }>;
}> = [
    {
        label: 'Operação',
        items: [
            { href: '/kds', label: 'KDS', icon: 'point_of_sale' },
            { href: '/atendimento', label: 'Atendimento', icon: 'restaurant' },
            { href: '/mesas', label: 'Mesas', icon: 'table_restaurant' },
            { href: '/caixa', label: 'Caixa', icon: 'savings' },
        ],
    },
    {
        label: 'Cadastros',
        items: [
            { href: '/catalog', label: 'Catálogo', icon: 'restaurant_menu' },
            { href: '/estoque', label: 'Estoque', icon: 'inventory_2' },
            { href: '/merchants', label: 'Estabelecimentos', icon: 'store' },
        ],
    },
    {
        label: 'Análise',
        items: [
            { href: '/reports', label: 'Relatórios', icon: 'analytics' },
            { href: '/logs', label: 'Registros', icon: 'manage_history' },
        ],
    },
    {
        items: [
            { href: '/settings', label: 'Configurações', icon: 'tune' },
        ],
    },
];

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
            {/* Top bar mobile */}
            <header className="lg:hidden border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-slate-950/80 backdrop-blur sticky top-0 z-30">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="p-2 -ml-2 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition"
                        aria-label="Abrir menu"
                    >
                        <span className="material-symbols-outlined">menu</span>
                    </button>
                    <BrandMark size="sm" />
                </div>
            </header>

            {/* Sidebar desktop */}
            <aside className="app-sidebar hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-white/[0.06] z-20">
                <SidebarContent pathname={pathname} onLogout={logout} />
            </aside>

            {/* Drawer mobile */}
            {drawerOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/60 z-40 animate-fade-in"
                    onClick={() => setDrawerOpen(false)}
                >
                    <aside
                        className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-white/[0.06] flex flex-col animate-slide-up"
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
            {/* Brand topo */}
            <div className="px-6 pt-6 pb-5">
                <Link href="/kds" onClick={onNavigate} className="block group">
                    <BrandMark />
                </Link>
            </div>

            {/* Navegação agrupada */}
            <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
                {NAV_GROUPS.map((group, gi) => (
                    <div key={gi} className="space-y-0.5">
                        {group.label && (
                            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                                {group.label}
                            </div>
                        )}
                        {group.items.map(item => {
                            const active = pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onNavigate}
                                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition group ${
                                        active
                                            ? 'bg-primary/10 text-primary'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {active && (
                                        <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-primary" />
                                    )}
                                    <span className={`material-symbols-outlined text-[20px] transition ${active ? '' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`}>
                                        {item.icon}
                                    </span>
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer: status + logout */}
            <div className="px-3 py-3 border-t border-slate-100 dark:border-white/[0.06]">
                <div className="px-3 py-2 mb-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Operador conectado</span>
                </div>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04] hover:text-red-600 dark:hover:text-red-400 transition group"
                    title="Sair"
                >
                    <span className="material-symbols-outlined text-[20px] text-slate-400 dark:text-slate-500 group-hover:text-red-500">logout</span>
                    Sair
                </button>
            </div>
        </>
    );
}

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
    const small = size === 'sm';
    return (
        <div className="flex items-center gap-3">
            <div className={`relative flex items-center justify-center ${small ? 'w-8 h-8' : 'w-10 h-10'} rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow`}>
                <span className={`material-symbols-outlined text-white ${small ? 'text-[20px]' : 'text-[24px]'}`}>storefront</span>
                <span className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-primary to-accent opacity-40 blur-sm -z-10" />
            </div>
            <div className="flex flex-col leading-none">
                <span className={`font-display font-black tracking-tight ${small ? 'text-base' : 'text-lg'}`}>
                    PDV<span className="text-primary">.</span>
                </span>
                {!small && (
                    <span className="text-[9px] font-mono mt-1 text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        Open Delivery <span className="text-primary">1.7</span>
                    </span>
                )}
            </div>
        </div>
    );
}
