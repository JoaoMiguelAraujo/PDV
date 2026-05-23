'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
    { href: '/kds', label: 'KDS', icon: 'point_of_sale' },
    { href: '/mesas', label: 'Mesas', icon: 'table_restaurant' },
    { href: '/catalog', label: 'Catálogo', icon: 'restaurant_menu' },
    { href: '/merchants', label: 'Merchants', icon: 'store' },
    { href: '/settings', label: 'Settings', icon: 'tune' },
    { href: '/logs', label: 'Logs', icon: 'list_alt' },
];

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();

    async function logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
    }

    return (
        <header className="border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
                <Link href="/kds" className="flex items-center gap-2 mr-4">
                    <span className="material-symbols-outlined text-primary">point_of_sale</span>
                    <span className="font-black tracking-tight">PDV</span>
                    <span className="text-[10px] font-mono bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded uppercase">OD v1.7</span>
                </Link>
                <nav className="flex items-center gap-1 flex-1">
                    {NAV.map(item => {
                        const active = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition ${
                                    active
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
                <button
                    onClick={logout}
                    className="text-xs font-bold flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                    title="Sair"
                >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    Sair
                </button>
            </div>
        </header>
    );
}
