'use client';

import { useCallback, useEffect, useState } from 'react';

interface MerchantLite { id: number; name: string }
interface Summary {
    from: string; to: string;
    vendas: {
        count: number; totalBruto: number; taxaServico: number; desconto: number;
        totalLiquido: number; ticketMedio: number; cmvTotal: number; margemBruta: number;
    };
    porMetodo: Array<{ metodo: string; count: number; valor: number }>;
    topProdutos: Array<{ produtoId: number; nome: string; qtd: number; valor: number }>;
    caixas: { count: number; diferencaTotal: number };
    callbacksErro: number;
}

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'custom';

function rangeFor(p: Periodo): { from: string; to: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);
    function fmt(d: Date) { return d.toISOString(); }
    if (p === 'hoje') return { from: fmt(today), to: fmt(tomorrow) };
    if (p === '7d') return { from: fmt(new Date(today.getTime() - 6 * 86400000)), to: fmt(tomorrow) };
    if (p === '30d') return { from: fmt(new Date(today.getTime() - 29 * 86400000)), to: fmt(tomorrow) };
    if (p === 'mes') {
        const ini = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: fmt(ini), to: fmt(tomorrow) };
    }
    return { from: fmt(today), to: fmt(tomorrow) };
}

export default function ReportsClient() {
    const [merchants, setMerchants] = useState<MerchantLite[]>([]);
    const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
    const [periodo, setPeriodo] = useState<Periodo>('hoje');
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);

    const loadMerchants = useCallback(async () => {
        const r = await fetch('/api/merchants', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        const list: MerchantLite[] = (d.merchants || []).map((m: any) => ({ id: m.id, name: m.name }));
        setMerchants(list);
        if (list.length && selectedMerchantId == null) setSelectedMerchantId(list[0].id);
    }, [selectedMerchantId]);

    const load = useCallback(async () => {
        if (selectedMerchantId == null) return;
        setLoading(true);
        try {
            const { from, to } = rangeFor(periodo);
            const r = await fetch(`/api/reports/summary?merchantId=${selectedMerchantId}&from=${from}&to=${to}`, { cache: 'no-store' });
            if (r.ok) setSummary(await r.json());
        } finally { setLoading(false); }
    }, [selectedMerchantId, periodo]);

    useEffect(() => { loadMerchants(); }, [loadMerchants]);
    useEffect(() => { load(); }, [load]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h1 className="text-xl font-black">Relatórios</h1>
                <select
                    value={selectedMerchantId ?? ''}
                    onChange={e => setSelectedMerchantId(parseInt(e.target.value, 10))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                    {merchants.length === 0 && <option value="">Cadastre um merchant</option>}
                    {merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div className="flex gap-1">
                    {(['hoje', '7d', '30d', 'mes'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriodo(p)}
                            className={`text-xs font-bold px-3 py-2 rounded-lg ${periodo === p ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}
                        >{p === 'hoje' ? 'Hoje' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : 'Este mês'}</button>
                    ))}
                </div>
            </div>

            {loading || !summary ? (
                <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : summary.vendas.count === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                    <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-700">analytics</span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        Nenhuma comanda fechada neste período.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Header KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Pedidos" valor={summary.vendas.count} />
                        <Kpi label="Total líquido" valor={`R$ ${summary.vendas.totalLiquido.toFixed(2)}`} tone="green" />
                        <Kpi label="Ticket médio" valor={`R$ ${summary.vendas.ticketMedio.toFixed(2)}`} />
                        <Kpi label="Margem bruta" valor={`${summary.vendas.margemBruta}%`} tone={summary.vendas.margemBruta > 50 ? 'green' : 'amber'} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Por método */}
                        <Card titulo="Vendas por método de pagamento">
                            {summary.porMetodo.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">Sem pagamentos.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {summary.porMetodo.sort((a, b) => b.valor - a.valor).map(m => {
                                        const pct = (m.valor / summary.vendas.totalLiquido) * 100;
                                        return (
                                            <li key={m.metodo}>
                                                <div className="flex justify-between text-sm font-bold mb-1">
                                                    <span>{m.metodo} <span className="text-[10px] text-slate-400 font-mono">({m.count})</span></span>
                                                    <span className="tabular-nums">R$ {m.valor.toFixed(2)} <span className="text-[10px] text-slate-400">{pct.toFixed(0)}%</span></span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-white/5 rounded overflow-hidden">
                                                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Card>

                        {/* DRE */}
                        <Card titulo="DRE simplificado">
                            <dl className="text-sm space-y-1">
                                <Linha label="Subtotal" valor={summary.vendas.totalBruto} />
                                <Linha label="(+) Taxa serviço" valor={summary.vendas.taxaServico} />
                                <Linha label="(−) Desconto" valor={-summary.vendas.desconto} tone="red" />
                                <div className="border-t border-slate-100 dark:border-white/5 my-1" />
                                <Linha label="Receita líquida" valor={summary.vendas.totalLiquido} bold />
                                <Linha label="(−) CMV" valor={-summary.vendas.cmvTotal} tone="red" />
                                <div className="border-t border-slate-100 dark:border-white/5 my-1" />
                                <Linha label="Margem bruta" valor={summary.vendas.totalLiquido - summary.vendas.cmvTotal} bold tone="green" />
                            </dl>
                        </Card>

                        {/* Top produtos */}
                        <Card titulo="Top 10 produtos" wide>
                            {summary.topProdutos.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">Sem produtos vendidos.</p>
                            ) : (
                                <ol className="space-y-2">
                                    {summary.topProdutos.map((p, i) => (
                                        <li key={p.produtoId} className="flex items-center gap-3 text-sm">
                                            <span className="text-[10px] font-black w-5 text-slate-400">{i + 1}</span>
                                            <span className="flex-1 truncate">{p.nome}</span>
                                            <span className="text-[10px] text-slate-500 font-mono w-16 text-right">{p.qtd}×</span>
                                            <span className="font-bold tabular-nums w-24 text-right">R$ {p.valor.toFixed(2)}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </Card>

                        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
                            <Kpi
                                label="Caixas fechados"
                                valor={summary.caixas.count}
                                hint={summary.caixas.count > 0 ? `Diferença Σ: R$ ${summary.caixas.diferencaTotal.toFixed(2)}` : undefined}
                            />
                            <Kpi
                                label="Callbacks com erro"
                                valor={summary.callbacksErro}
                                tone={summary.callbacksErro > 0 ? 'amber' : 'green'}
                                hint="Pedidos para o menuGo que falharam — veja em Logs"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Kpi({ label, valor, tone, hint }: { label: string; valor: string | number; tone?: 'green' | 'amber' | 'red'; hint?: string }) {
    const cls = tone === 'green' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-red-600' : '';
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
            <div className={`text-2xl font-black tabular-nums mt-1 ${cls}`}>{valor}</div>
            {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
        </div>
    );
}

function Card({ titulo, children, wide }: { titulo: string; children: React.ReactNode; wide?: boolean }) {
    return (
        <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-4 ${wide ? 'lg:col-span-2' : ''}`}>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">{titulo}</h3>
            {children}
        </div>
    );
}

function Linha({ label, valor, bold, tone }: { label: string; valor: number; bold?: boolean; tone?: 'red' | 'green' }) {
    const cls = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : '';
    return (
        <div className="flex justify-between">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={`tabular-nums ${bold ? 'font-black' : 'font-bold'} ${cls}`}>R$ {Math.abs(valor).toFixed(2)}</dd>
        </div>
    );
}
