'use client';

import { useCallback, useEffect, useState } from 'react';

interface MerchantLite { id: number; name: string }
interface Insumo {
    id: number;
    merchantId: number;
    nome: string;
    unidade: 'UN' | 'KG' | 'G' | 'L' | 'ML' | 'CX' | 'PCT';
    qtdAtual: string;
    qtdMinima: string;
    custoMedio: string;
    sku: string | null;
    ativo: boolean;
    observacao: string | null;
}

const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'CX', 'PCT'] as const;
const TIPOS_MOV = ['ENTRADA', 'SAIDA', 'PERDA', 'AJUSTE'] as const;

export default function EstoqueClient() {
    const [merchants, setMerchants] = useState<MerchantLite[]>([]);
    const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
    const [insumos, setInsumos] = useState<Insumo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showInsumoForm, setShowInsumoForm] = useState<{ open: boolean; edit?: Insumo }>({ open: false });
    const [showMov, setShowMov] = useState<Insumo | null>(null);
    const [filtro, setFiltro] = useState<'todos' | 'alerta'>('todos');
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

    const load = useCallback(async () => {
        if (selectedMerchantId == null) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ merchantId: String(selectedMerchantId) });
            if (filtro === 'alerta') params.set('alerta', '1');
            const r = await fetch(`/api/insumos?${params.toString()}`, { cache: 'no-store' });
            if (r.ok) setInsumos((await r.json()).insumos || []);
        } finally { setLoading(false); }
    }, [selectedMerchantId, filtro]);

    useEffect(() => { loadMerchants(); }, [loadMerchants]);
    useEffect(() => { load(); }, [load]);

    async function delInsumo(i: Insumo) {
        if (!confirm(`Remover insumo "${i.nome}"?`)) return;
        const r = await fetch(`/api/insumos/${i.id}`, { method: 'DELETE' });
        if (r.ok) { showToast('Removido'); load(); } else showToast('Erro');
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h1 className="text-xl font-black">Estoque</h1>
                <select
                    value={selectedMerchantId ?? ''}
                    onChange={e => setSelectedMerchantId(parseInt(e.target.value, 10))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm"
                >
                    {merchants.length === 0 && <option value="">Cadastre um merchant</option>}
                    {merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <div className="flex gap-1">
                    <button onClick={() => setFiltro('todos')} className={`text-xs font-bold px-3 py-2 rounded-lg ${filtro === 'todos' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}>Todos</button>
                    <button onClick={() => setFiltro('alerta')} className={`text-xs font-bold px-3 py-2 rounded-lg ${filtro === 'alerta' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-white/5'}`}>⚠ Alerta</button>
                </div>
                <button
                    onClick={() => setShowInsumoForm({ open: true })}
                    disabled={selectedMerchantId == null}
                    className="ml-auto text-xs font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-40 flex items-center gap-1.5"
                >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Novo insumo
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : insumos.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                    <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-700">inventory_2</span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        {filtro === 'alerta' ? 'Nenhum insumo em alerta.' : 'Nenhum insumo cadastrado.'}
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {insumos.map(i => {
                        const alerta = Number(i.qtdAtual) <= Number(i.qtdMinima);
                        return (
                            <li
                                key={i.id}
                                className={`flex items-center gap-3 bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 ${alerta ? 'border-amber-300 dark:border-amber-500/40' : 'border-slate-200 dark:border-white/10'} ${!i.ativo ? 'opacity-50' : ''}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold truncate">{i.nome}</div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        SKU {i.sku || '—'} · custo médio R$ {Number(i.custoMedio).toFixed(4)}/{i.unidade}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={`text-sm font-black tabular-nums ${alerta ? 'text-amber-600' : ''}`}>
                                        {Number(i.qtdAtual).toFixed(3)} {i.unidade}
                                    </div>
                                    <div className="text-[10px] text-slate-400">mín {Number(i.qtdMinima).toFixed(3)}</div>
                                </div>
                                {alerta && (
                                    <span className="text-[10px] font-black px-2 py-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">⚠</span>
                                )}
                                <button onClick={() => setShowMov(i)} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10">
                                    Movimento
                                </button>
                                <button onClick={() => setShowInsumoForm({ open: true, edit: i })} className="p-2 text-slate-400 hover:text-primary">
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button onClick={() => delInsumo(i)} className="p-2 text-slate-400 hover:text-red-600">
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {showInsumoForm.open && selectedMerchantId != null && (
                <InsumoForm
                    merchantId={selectedMerchantId}
                    edit={showInsumoForm.edit}
                    onClose={() => setShowInsumoForm({ open: false })}
                    onSaved={() => { setShowInsumoForm({ open: false }); load(); }}
                />
            )}

            {showMov && (
                <MovimentoDialog
                    insumo={showMov}
                    onClose={() => setShowMov(null)}
                    onSaved={() => { setShowMov(null); load(); }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">{toast}</div>
            )}
        </div>
    );
}

function InsumoForm({ merchantId, edit, onClose, onSaved }: {
    merchantId: number;
    edit?: Insumo;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [nome, setNome] = useState(edit?.nome ?? '');
    const [unidade, setUnidade] = useState(edit?.unidade ?? 'UN');
    const [qtdMinima, setQtdMinima] = useState(edit ? String(edit.qtdMinima) : '0');
    const [qtdAtual, setQtdAtual] = useState(edit ? String(edit.qtdAtual) : '0');
    const [custoMedio, setCustoMedio] = useState(edit ? String(edit.custoMedio) : '0');
    const [sku, setSku] = useState(edit?.sku ?? '');
    const [ativo, setAtivo] = useState(edit?.ativo ?? true);
    const [observacao, setObservacao] = useState(edit?.observacao ?? '');
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        const body: any = { nome, unidade, qtdMinima: Number(qtdMinima), sku, ativo, observacao };
        if (!edit) {
            body.merchantId = merchantId;
            body.qtdAtual = Number(qtdAtual);
            body.custoMedio = Number(custoMedio);
        }
        const url = edit ? `/api/insumos/${edit.id}` : '/api/insumos';
        const r = await fetch(url, {
            method: edit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro');
    }

    return (
        <Modal onClose={onClose} title={edit ? 'Editar insumo' : 'Novo insumo'}>
            <div className="space-y-3">
                <label className="block"><span className={LABEL}>Nome *</span><input value={nome} onChange={e => setNome(e.target.value)} className={INPUT_CLS} /></label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className={LABEL}>Unidade</span>
                        <select value={unidade} onChange={e => setUnidade(e.target.value as any)} className={INPUT_CLS}>
                            {UNIDADES.map(u => <option key={u}>{u}</option>)}
                        </select>
                    </label>
                    <label className="block"><span className={LABEL}>SKU</span><input value={sku} onChange={e => setSku(e.target.value)} className={INPUT_CLS} /></label>
                </div>
                {!edit && (
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block"><span className={LABEL}>Qtd inicial</span><input type="number" step="0.001" min="0" value={qtdAtual} onChange={e => setQtdAtual(e.target.value)} className={INPUT_CLS} /></label>
                        <label className="block"><span className={LABEL}>Custo médio inicial</span><input type="number" step="0.0001" min="0" value={custoMedio} onChange={e => setCustoMedio(e.target.value)} className={INPUT_CLS} /></label>
                    </div>
                )}
                <label className="block"><span className={LABEL}>Qtd mínima (alerta)</span><input type="number" step="0.001" min="0" value={qtdMinima} onChange={e => setQtdMinima(e.target.value)} className={INPUT_CLS} /></label>
                <label className="block"><span className={LABEL}>Observação</span><textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className={INPUT_CLS} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-primary" /><span className="font-bold">Ativo</span></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                <button onClick={submit} disabled={busy || !nome} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
        </Modal>
    );
}

function MovimentoDialog({ insumo, onClose, onSaved }: {
    insumo: Insumo;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [tipo, setTipo] = useState<typeof TIPOS_MOV[number]>('ENTRADA');
    const [quantidade, setQuantidade] = useState('');
    const [custoUnitario, setCustoUnitario] = useState('');
    const [observacao, setObservacao] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        const body: any = { tipo, quantidade: Number(quantidade), observacao };
        if (tipo === 'ENTRADA' && custoUnitario) body.custoUnitario = Number(custoUnitario);
        const r = await fetch(`/api/insumos/${insumo.id}/movimentos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro');
    }

    return (
        <Modal onClose={onClose} title={`Movimento — ${insumo.nome}`}>
            <p className="text-xs text-slate-500 mb-3">
                Estoque atual: <strong>{Number(insumo.qtdAtual).toFixed(3)} {insumo.unidade}</strong>
                {' '}· Custo médio: <strong>R$ {Number(insumo.custoMedio).toFixed(4)}</strong>
            </p>
            <div className="space-y-3">
                <div>
                    <span className={LABEL}>Tipo</span>
                    <div className="grid grid-cols-4 gap-1">
                        {TIPOS_MOV.map(t => (
                            <button key={t} onClick={() => setTipo(t)} className={`text-xs font-bold px-3 py-2 rounded-lg ${tipo === t ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}>{t}</button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                        ENTRADA = compra · SAIDA = uso interno · PERDA = descarte · AJUSTE = correção
                    </p>
                </div>
                <label className="block"><span className={LABEL}>Quantidade ({insumo.unidade})</span><input type="number" step="0.001" min="0.001" value={quantidade} onChange={e => setQuantidade(e.target.value)} className={INPUT_CLS} /></label>
                {tipo === 'ENTRADA' && (
                    <label className="block">
                        <span className={LABEL}>Custo por unidade (R$)</span>
                        <input type="number" step="0.0001" min="0" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)} className={INPUT_CLS} />
                        <p className="text-[10px] text-slate-500 mt-1">Recalcula custo médio ponderado. Deixe vazio para manter o atual.</p>
                    </label>
                )}
                <label className="block"><span className={LABEL}>Observação</span><input value={observacao} onChange={e => setObservacao(e.target.value)} className={INPUT_CLS} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                <button onClick={submit} disabled={busy || !quantidade} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Registrar'}</button>
            </div>
        </Modal>
    );
}

const INPUT_CLS = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm';
const LABEL = 'block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400';

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20 p-4" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border">
                <h2 className="text-lg font-black mb-4">{title}</h2>
                {children}
            </div>
        </div>
    );
}
