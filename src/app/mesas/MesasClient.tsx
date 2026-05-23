'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/PageHeader';

interface MerchantLite { id: number; name: string }
interface ComandaAberta { id: number; codigo: string; total: string; totalPago: string; abertaEm: string }
interface Mesa {
    id: number;
    numero: string;
    capacidade: number | null;
    ativo: boolean;
    observacao: string | null;
    merchantId: number;
    comandas: ComandaAberta[];
}

export default function MesasClient() {
    const router = useRouter();
    const [merchants, setMerchants] = useState<MerchantLite[]>([]);
    const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
    const [mesas, setMesas] = useState<Mesa[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState<{ open: boolean; edit?: Mesa }>({ open: false });
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

    const loadMerchants = useCallback(async () => {
        const r = await fetch('/api/merchants', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        const list: MerchantLite[] = (d.merchants || []).map((m: any) => ({ id: m.id, name: m.name }));
        setMerchants(list);
        if (list.length && selectedMerchantId == null) setSelectedMerchantId(list[0].id);
    }, [selectedMerchantId]);

    const loadMesas = useCallback(async () => {
        if (selectedMerchantId == null) return;
        setLoading(true);
        try {
            const r = await fetch(`/api/mesas?merchantId=${selectedMerchantId}`, { cache: 'no-store' });
            if (r.ok) setMesas((await r.json()).mesas || []);
        } finally {
            setLoading(false);
        }
    }, [selectedMerchantId]);

    useEffect(() => { loadMerchants(); }, [loadMerchants]);
    useEffect(() => { loadMesas(); }, [loadMesas]);

    async function abrirComanda(mesaId: number) {
        const r = await fetch('/api/comandas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchantId: selectedMerchantId, mesaId }),
        });
        if (r.ok) {
            const d = await r.json();
            router.push(`/comandas/${d.id}`);
        } else {
            showToast('Falha ao abrir comanda');
        }
    }

    async function delMesa(m: Mesa) {
        if (!confirm(`Remover mesa "${m.numero}"?`)) return;
        const r = await fetch(`/api/mesas/${m.id}`, { method: 'DELETE' });
        if (r.ok) { showToast('Mesa removida'); loadMesas(); }
        else showToast((await r.json()).message || 'Falha');
    }

    return (
        <PageContainer>
            <PageHeader
                title="Mesas"
                subtitle="Salão e atendimento — abra comandas direto pelo número da mesa."
                icon="table_restaurant"
            >
                <select
                    value={selectedMerchantId ?? ''}
                    onChange={e => setSelectedMerchantId(parseInt(e.target.value, 10))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm font-medium"
                >
                    {merchants.length === 0 && <option value="">Cadastre um estabelecimento</option>}
                    {merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button
                    onClick={() => setShowForm({ open: true })}
                    disabled={selectedMerchantId == null}
                    className="text-sm font-bold px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 hover:shadow-glow flex items-center gap-1.5 disabled:opacity-40 transition"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Nova mesa
                </button>
            </PageHeader>

            {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : mesas.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                    <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-700">table_restaurant</span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Nenhuma mesa cadastrada.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {mesas.map(m => {
                        const ocupada = m.comandas.length > 0;
                        const total = m.comandas.reduce((s, c) => s + Number(c.total), 0);
                        return (
                            <article
                                key={m.id}
                                className={`group relative rounded-2xl p-5 cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated animate-fade-in ${
                                    !m.ativo
                                        ? 'opacity-40 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40'
                                        : ocupada
                                        ? 'border border-amber-300/60 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-500/[0.06] dark:to-amber-500/[0.02]'
                                        : 'border border-emerald-300/60 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-500/[0.06] dark:to-emerald-500/[0.02]'
                                }`}
                                onClick={() => {
                                    if (!m.ativo) return;
                                    if (ocupada) router.push(`/comandas/${m.comandas[0].id}`);
                                    else abrirComanda(m.id);
                                }}
                            >
                                {/* Glow no canto superior */}
                                {m.ativo && (
                                    <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-40 ${
                                        ocupada ? 'bg-amber-400' : 'bg-emerald-400'
                                    }`} />
                                )}
                                <div className="relative">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="font-display text-3xl font-black tracking-tight">{m.numero}</div>
                                        <span className={`text-[9px] font-black uppercase tracking-[0.14em] px-2 py-1 rounded-md ${
                                            ocupada
                                                ? 'bg-amber-500/20 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                                : 'bg-emerald-500/20 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                        }`}>
                                            {ocupada ? 'ocupada' : 'livre'}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">group</span>
                                        {m.capacidade ? `${m.capacidade} lugares` : 'sem cap.'}
                                    </div>
                                    {ocupada ? (
                                        <>
                                            <div className="text-[10px] font-mono opacity-60 mb-0.5">{m.comandas[0].codigo}</div>
                                            <div className="text-xl font-black tabular-nums text-amber-700 dark:text-amber-300">R$ {total.toFixed(2)}</div>
                                        </>
                                    ) : (
                                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                            Abrir comanda
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowForm({ open: true, edit: m }); }}
                                    className="absolute top-2 right-2 p-1.5 rounded-md text-slate-400 hover:text-primary hover:bg-white/40 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100 transition"
                                    title="Editar"
                                >
                                    <span className="material-symbols-outlined text-[14px]">edit</span>
                                </button>
                            </article>
                        );
                    })}
                </div>
            )}

            {showForm.open && selectedMerchantId != null && (
                <MesaForm
                    merchantId={selectedMerchantId}
                    edit={showForm.edit}
                    onClose={() => setShowForm({ open: false })}
                    onSaved={() => { setShowForm({ open: false }); loadMesas(); }}
                    onDelete={async () => {
                        if (showForm.edit) {
                            await delMesa(showForm.edit);
                            setShowForm({ open: false });
                        }
                    }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">{toast}</div>
            )}
        </PageContainer>
    );
}

function MesaForm({ merchantId, edit, onClose, onSaved, onDelete }: {
    merchantId: number;
    edit?: Mesa;
    onClose: () => void;
    onSaved: () => void;
    onDelete: () => Promise<void>;
}) {
    const [numero, setNumero] = useState(edit?.numero ?? '');
    const [capacidade, setCapacidade] = useState(edit?.capacidade != null ? String(edit.capacidade) : '');
    const [observacao, setObservacao] = useState(edit?.observacao ?? '');
    const [ativo, setAtivo] = useState(edit?.ativo ?? true);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        const body = {
            merchantId,
            numero,
            capacidade: capacidade === '' ? null : Number(capacidade),
            observacao,
            ativo,
        };
        const url = edit ? `/api/mesas/${edit.id}` : '/api/mesas';
        const r = await fetch(url, {
            method: edit ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro');
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20 p-4" onClick={onClose}>
            <form onSubmit={submit} onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border">
                <h2 className="text-lg font-black mb-4">{edit ? 'Editar mesa' : 'Nova mesa'}</h2>
                <div className="space-y-3">
                    <label className="block">
                        <span className="block text-[11px] font-bold uppercase mb-1">Número/ID *</span>
                        <input required value={numero} onChange={e => setNumero(e.target.value)} maxLength={20} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm" />
                    </label>
                    <label className="block">
                        <span className="block text-[11px] font-bold uppercase mb-1">Capacidade</span>
                        <input type="number" min={1} value={capacidade} onChange={e => setCapacidade(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm" />
                    </label>
                    <label className="block">
                        <span className="block text-[11px] font-bold uppercase mb-1">Observação</span>
                        <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm" />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-primary" />
                        <span className="font-bold">Ativa</span>
                    </label>
                </div>
                <div className="flex justify-between gap-2 mt-4">
                    {edit && (
                        <button type="button" onClick={onDelete} className="text-sm font-bold px-3 py-2 rounded-lg text-red-600 hover:bg-red-50">Excluir</button>
                    )}
                    <div className="flex-1" />
                    <button type="button" onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                    <button type="submit" disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar'}</button>
                </div>
            </form>
        </div>
    );
}
