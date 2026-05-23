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
        <div className="min-h-screen flex">
            {/* Painel esquerdo — hero com brand. Aparece só em lg+. */}
            <div className="hidden lg:flex flex-1 relative overflow-hidden bg-slate-950">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/10" />
                <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/30 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />

                <div className="relative z-10 flex flex-col justify-between p-12 w-full">
                    <div className="flex items-center gap-3">
                        <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-[28px]">storefront</span>
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="font-display text-xl font-black tracking-tight">
                                PDV<span className="text-primary">.</span>
                            </span>
                            <span className="text-[10px] font-mono mt-1 text-slate-400 uppercase tracking-widest">
                                Open Delivery 1.7
                            </span>
                        </div>
                    </div>

                    <div className="max-w-md">
                        <h1 className="font-display text-4xl xl:text-5xl font-black leading-tight mb-4">
                            Seu PDV.<br />
                            <span className="text-gradient-primary">Conectado ao Open Delivery</span>.
                        </h1>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Recebe pedidos via webhook HMAC, gerencia ciclo de vida no KDS,
                            controla mesas, caixa, estoque e exporta o catálogo no formato
                            oficial da Abrasel.
                        </p>
                    </div>

                    <div className="text-[10px] font-mono text-slate-500 tracking-widest">
                        SOFTWARE SERVICE · HOMOLOGÁVEL · ABRASEL OD V1.7
                    </div>
                </div>
            </div>

            {/* Painel direito — form */}
            <div className="flex-1 flex items-center justify-center px-6 py-12 lg:max-w-lg">
                <form onSubmit={handleSubmit} className="w-full max-w-sm animate-fade-in">
                    {/* Brand mobile (some em lg+) */}
                    <div className="lg:hidden flex items-center gap-3 mb-8">
                        <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-[24px]">storefront</span>
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="font-display text-lg font-black tracking-tight">
                                PDV<span className="text-primary">.</span>
                            </span>
                            <span className="text-[9px] font-mono mt-1 text-slate-500 uppercase tracking-widest">
                                Open Delivery 1.7
                            </span>
                        </div>
                    </div>

                    <h2 className="font-display text-2xl font-black tracking-tight mb-1.5">Bem-vindo de volta</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
                        Entre com a senha do operador para acessar o KDS.
                    </p>

                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-slate-600 dark:text-slate-400">
                        Senha do operador
                    </label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">lock</span>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            autoFocus
                            placeholder="••••••••"
                            className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-slate-900/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm font-medium transition"
                        />
                    </div>

                    {error && (
                        <div className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2.5 rounded-lg flex items-center gap-2 animate-fade-in">
                            <span className="material-symbols-outlined text-[16px]">error</span>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-6 w-full bg-gradient-to-r from-primary to-accent text-white font-bold py-3 rounded-xl hover:opacity-95 hover:shadow-glow disabled:opacity-50 transition flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                Entrando…
                            </>
                        ) : (
                            <>
                                Entrar
                                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                            </>
                        )}
                    </button>

                    <p className="mt-8 text-[10px] text-slate-400 dark:text-slate-500 text-center font-mono tracking-wider">
                        Sessão criptografada · HMAC-SHA256 · 30 dias
                    </p>
                </form>
            </div>
        </div>
    );
}
