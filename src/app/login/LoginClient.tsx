'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginClient() {
    const router = useRouter();
    const params = useSearchParams();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (!res.ok) {
                setError(res.status === 401 ? 'Senha incorreta' : 'Erro ao autenticar');
                return;
            }
            const dest = params.get('from') || '/kds';
            router.replace(dest);
            router.refresh();
        } catch (err: any) {
            setError(err?.message || 'Erro de rede');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-xl"
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-primary text-3xl">point_of_sale</span>
                    <h1 className="text-xl font-black tracking-tight">PDV</h1>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                    Software Service Open Delivery v1.7
                </p>

                <label className="block text-sm font-bold mb-1.5">Senha do operador</label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                />

                {error && (
                    <div className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 w-full bg-primary text-white font-bold py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                >
                    {loading ? 'Entrando…' : 'Entrar'}
                </button>
            </form>
        </div>
    );
}
