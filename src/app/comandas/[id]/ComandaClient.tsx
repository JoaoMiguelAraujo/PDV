'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Comanda {
    id: number;
    codigo: string;
    merchantId: number;
    mesaId: number | null;
    mesa: { id: number; numero: string } | null;
    merchant: { id: number; name: string };
    status: 'ABERTA' | 'FECHADA' | 'CANCELADA';
    clienteNome: string | null;
    clienteTelefone: string | null;
    clienteDocumento: string | null;
    observacao: string | null;
    subtotal: string;
    taxaServico: string;
    desconto: string;
    total: string;
    totalPago: string;
    abertaEm: string;
    fechadaEm: string | null;
    itens: ItemComanda[];
    pagamentos: Pagamento[];
}
interface ItemComanda {
    id: number;
    produtoId: number | null;
    produto: { id: number; nome: string; fotoUrl: string | null } | null;
    nomeSnapshot: string;
    precoSnapshot: string;
    quantidade: string;
    acrescimoOpcoes: string;
    total: string;
    observacao: string | null;
    status: string;
    opcoes: Array<{ grupoId: number; opcaoId: number; nome: string; preco: number }>;
}
interface Pagamento {
    id: number;
    metodo: string;
    valor: string;
    troco: string;
    transactionId: string | null;
    registradoEm: string;
}
interface ProdutoMin {
    id: number;
    nome: string;
    preco: string;
    sku: string | null;
    fotoUrl: string | null;
    grupos: GrupoMin[];
}
interface GrupoMin {
    id: number;
    nome: string;
    min: number;
    max: number;
    opcoes: Array<{ id: number; nome: string; precoAdicional: string; ativo: boolean }>;
}

const METODOS = ['DINHEIRO', 'PIX', 'CREDITO', 'DEBITO', 'VOUCHER', 'OUTRO'] as const;

export default function ComandaClient({ id }: { id: number }) {
    const router = useRouter();
    const [comanda, setComanda] = useState<Comanda | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showPay, setShowPay] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

    const load = useCallback(async () => {
        const r = await fetch(`/api/comandas/${id}`, { cache: 'no-store' });
        if (r.ok) setComanda(await r.json());
        setLoading(false);
    }, [id]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>;
    if (!comanda) return <div className="text-center py-20 text-slate-400 text-sm">Comanda não encontrada.</div>;

    const restante = Math.max(0, +(Number(comanda.total) - Number(comanda.totalPago)).toFixed(2));

    async function patchComanda(body: any, msg: string) {
        const r = await fetch(`/api/comandas/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (r.ok) { showToast(msg); load(); }
        else showToast((await r.json()).message || 'Erro');
    }

    async function delItem(itemId: number) {
        if (!confirm('Remover item?')) return;
        const r = await fetch(`/api/comandas/${id}/itens/${itemId}`, { method: 'DELETE' });
        if (r.ok) load();
    }

    async function fechar() {
        if (restante > 0) {
            showToast(`Falta R$ ${restante.toFixed(2)} para fechar`);
            return;
        }
        if (!confirm('Fechar comanda?')) return;
        await patchComanda({ status: 'FECHADA' }, 'Comanda fechada');
    }

    async function cancelar() {
        const motivo = prompt('Motivo do cancelamento:');
        if (motivo == null) return;
        await patchComanda({ status: 'CANCELADA', cancelMotivo: motivo }, 'Comanda cancelada');
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Esquerda: itens */}
            <section className="lg:col-span-8 space-y-3">
                <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => router.back()} className="text-slate-400 hover:text-primary">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-black font-mono">{comanda.codigo}</h1>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${
                        comanda.status === 'ABERTA' ? 'bg-emerald-100 text-emerald-700' :
                        comanda.status === 'FECHADA' ? 'bg-slate-200 text-slate-600' : 'bg-red-100 text-red-700'
                    }`}>{comanda.status}</span>
                    {comanda.mesa && (
                        <span className="text-sm font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">table_restaurant</span>
                            Mesa {comanda.mesa.numero}
                        </span>
                    )}
                    {comanda.clienteNome && <span className="text-sm">· {comanda.clienteNome}</span>}
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                        <h2 className="text-sm font-black">Itens ({comanda.itens.filter(i => i.status !== 'CANCELADO').length})</h2>
                        {comanda.status === 'ABERTA' && (
                            <button onClick={() => setShowAdd(true)} className="text-xs font-bold px-3 py-2 rounded-lg bg-primary text-white flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">add</span>
                                Adicionar produto
                            </button>
                        )}
                    </div>
                    {comanda.itens.length === 0 ? (
                        <p className="text-center py-10 text-slate-400 text-sm">Sem itens. Adicione um produto.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100 dark:divide-white/5">
                            {comanda.itens.map(it => (
                                <li key={it.id} className={`px-4 py-3 ${it.status === 'CANCELADO' ? 'opacity-40 line-through' : ''}`}>
                                    <div className="flex items-start gap-3">
                                        <span className="font-black text-primary tabular-nums w-12 flex-shrink-0">{Number(it.quantidade)}×</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold">{it.nomeSnapshot}</div>
                                            {it.opcoes?.length > 0 && (
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    + {it.opcoes.map(o => o.nome).join(', ')}
                                                </div>
                                            )}
                                            {it.observacao && (
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">{it.observacao}</div>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black tabular-nums">R$ {Number(it.total).toFixed(2)}</div>
                                            <div className="text-[10px] text-slate-400">R$ {(Number(it.precoSnapshot) + Number(it.acrescimoOpcoes)).toFixed(2)} un</div>
                                        </div>
                                        {comanda.status === 'ABERTA' && (
                                            <button onClick={() => delItem(it.id)} className="text-slate-400 hover:text-red-600 p-1">
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {comanda.observacao && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic px-2">📝 {comanda.observacao}</p>
                )}
            </section>

            {/* Direita: totais e pagamento */}
            <aside className="lg:col-span-4 space-y-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-4 sticky top-[80px]">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Resumo</h3>
                    <dl className="space-y-1 text-sm">
                        <Linha label="Subtotal" valor={comanda.subtotal} />
                        <LinhaEditavel label="Taxa serviço" valor={comanda.taxaServico} disabled={comanda.status !== 'ABERTA'} onSave={v => patchComanda({ taxaServico: v }, 'Atualizado')} />
                        <LinhaEditavel label="Desconto" valor={comanda.desconto} disabled={comanda.status !== 'ABERTA'} onSave={v => patchComanda({ desconto: v }, 'Atualizado')} />
                        <div className="border-t border-slate-100 dark:border-white/5 my-2" />
                        <Linha label="Total" valor={comanda.total} bold />
                        <Linha label="Pago" valor={comanda.totalPago} />
                        <Linha label="Restante" valor={String(restante)} bold tone={restante > 0 ? 'red' : 'green'} />
                    </dl>

                    {comanda.pagamentos.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Pagamentos</div>
                            <ul className="space-y-0.5 text-xs">
                                {comanda.pagamentos.map(p => (
                                    <li key={p.id} className="flex justify-between">
                                        <span className="font-mono">{p.metodo}</span>
                                        <span className="font-bold tabular-nums">R$ {Number(p.valor).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {comanda.status === 'ABERTA' && (
                        <div className="mt-4 space-y-2">
                            <button onClick={() => setShowPay(true)} className="w-full text-sm font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
                                Adicionar pagamento
                            </button>
                            <button onClick={fechar} disabled={restante > 0} className="w-full text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-40">
                                {restante > 0 ? `Falta R$ ${restante.toFixed(2)}` : 'Fechar comanda'}
                            </button>
                            <button onClick={cancelar} className="w-full text-xs font-bold px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                                Cancelar comanda
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {showAdd && comanda.merchantId && (
                <AdicionarItemDialog
                    merchantId={comanda.merchantId}
                    comandaId={comanda.id}
                    onClose={() => setShowAdd(false)}
                    onAdded={() => { setShowAdd(false); load(); }}
                />
            )}

            {showPay && (
                <PagamentoDialog
                    comandaId={comanda.id}
                    sugestao={restante}
                    onClose={() => setShowPay(false)}
                    onSaved={() => { setShowPay(false); load(); }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">{toast}</div>
            )}
        </div>
    );
}

function Linha({ label, valor, bold, tone }: { label: string; valor: string; bold?: boolean; tone?: 'red' | 'green' }) {
    const cls = tone === 'red' ? 'text-red-600 dark:text-red-400' : tone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : '';
    return (
        <div className="flex justify-between items-center">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={`tabular-nums ${bold ? 'font-black text-base' : 'font-bold'} ${cls}`}>R$ {Number(valor).toFixed(2)}</dd>
        </div>
    );
}

function LinhaEditavel({ label, valor, disabled, onSave }: { label: string; valor: string; disabled: boolean; onSave: (v: number) => Promise<void> | void }) {
    const [editing, setEditing] = useState(false);
    const [v, setV] = useState(String(Number(valor).toFixed(2)));
    if (!editing) {
        return (
            <div className="flex justify-between items-center">
                <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="flex items-center gap-1">
                    <span className="font-bold tabular-nums">R$ {Number(valor).toFixed(2)}</span>
                    {!disabled && (
                        <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-primary p-0.5">
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                        </button>
                    )}
                </dd>
            </div>
        );
    }
    return (
        <div className="flex justify-between items-center gap-1">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            <div className="flex items-center gap-1">
                <input
                    autoFocus
                    type="number"
                    step="0.01"
                    min={0}
                    value={v}
                    onChange={e => setV(e.target.value)}
                    className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-xs"
                />
                <button onClick={async () => { await onSave(Number(v) || 0); setEditing(false); }} className="text-primary p-0.5">
                    <span className="material-symbols-outlined text-[14px]">check</span>
                </button>
                <button onClick={() => setEditing(false)} className="text-slate-400 p-0.5">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
            </div>
        </div>
    );
}

// ============================================================================
// Diálogo: Adicionar item
// ============================================================================

function AdicionarItemDialog({ merchantId, comandaId, onClose, onAdded }: {
    merchantId: number; comandaId: number; onClose: () => void; onAdded: () => void;
}) {
    const [produtos, setProdutos] = useState<ProdutoMin[]>([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<ProdutoMin | null>(null);
    const [qty, setQty] = useState(1);
    const [obs, setObs] = useState('');
    const [opcoes, setOpcoes] = useState<Record<number, number[]>>({}); // grupoId → opcaoId[]
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        (async () => {
            const r = await fetch(`/api/produtos?merchantId=${merchantId}&ativo=1&limit=1000`, { cache: 'no-store' });
            if (r.ok) setProdutos((await r.json()).produtos || []);
        })();
    }, [merchantId]);

    useEffect(() => {
        if (!selected) return;
        (async () => {
            const r = await fetch(`/api/produtos/${selected.id}`, { cache: 'no-store' });
            if (r.ok) {
                const d = await r.json();
                setSelected({ ...selected, grupos: d.grupos });
                // Auto-seleciona primeira opção dos grupos com min>=1
                const init: Record<number, number[]> = {};
                for (const g of d.grupos as GrupoMin[]) {
                    if (g.min >= 1 && g.opcoes.length) init[g.id] = [g.opcoes[0].id];
                }
                setOpcoes(init);
            }
        })();
    }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return produtos.slice(0, 50);
        return produtos.filter(p => p.nome.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)).slice(0, 50);
    }, [produtos, search]);

    function toggleOpcao(grupoId: number, opcaoId: number, max: number) {
        setOpcoes(o => {
            const cur = o[grupoId] || [];
            if (cur.includes(opcaoId)) return { ...o, [grupoId]: cur.filter(x => x !== opcaoId) };
            if (max === 1) return { ...o, [grupoId]: [opcaoId] };
            if (cur.length >= max) return o;
            return { ...o, [grupoId]: [...cur, opcaoId] };
        });
    }

    async function adicionar() {
        if (!selected) return;
        setBusy(true);
        const opcoesArr: Array<{ grupoId: number; opcaoId: number }> = [];
        for (const [g, list] of Object.entries(opcoes)) {
            for (const o of list) opcoesArr.push({ grupoId: Number(g), opcaoId: o });
        }
        const r = await fetch(`/api/comandas/${comandaId}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ produtoId: selected.id, quantidade: qty, observacao: obs, opcoes: opcoesArr }),
        });
        setBusy(false);
        if (r.ok) onAdded();
        else alert((await r.json()).message || 'Erro');
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-12 p-4" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border max-h-[80vh] overflow-y-auto">
                <header className="px-6 py-4 border-b flex items-center justify-between">
                    <h2 className="text-lg font-black">Adicionar produto</h2>
                    <button onClick={onClose}><span className="material-symbols-outlined">close</span></button>
                </header>

                <div className="px-6 py-4 space-y-3">
                    {!selected ? (
                        <>
                            <input autoFocus placeholder="Buscar produto…" value={search} onChange={e => setSearch(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950" />
                            <ul className="max-h-[50vh] overflow-y-auto space-y-1">
                                {filtered.map(p => (
                                    <li key={p.id}>
                                        <button onClick={() => setSelected(p)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-left">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold truncate">{p.nome}</div>
                                                <div className="text-[10px] text-slate-500 font-mono">{p.sku || '—'}</div>
                                            </div>
                                            <div className="text-sm font-black tabular-nums">R$ {Number(p.preco).toFixed(2)}</div>
                                        </button>
                                    </li>
                                ))}
                                {filtered.length === 0 && <li className="text-sm text-slate-400 italic text-center py-4">Nenhum produto.</li>}
                            </ul>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setSelected(null)} className="text-xs text-primary hover:underline flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                                Trocar produto
                            </button>
                            <div className="text-lg font-black">{selected.nome}</div>
                            {selected.grupos?.map(g => (
                                <div key={g.id} className="border border-slate-200 dark:border-white/10 rounded-lg p-3">
                                    <div className="font-bold text-sm mb-1">{g.nome} <span className="text-[10px] text-slate-500">(min {g.min} · max {g.max})</span></div>
                                    <div className="flex flex-wrap gap-1">
                                        {g.opcoes.filter(o => o.ativo).map(o => {
                                            const checked = (opcoes[g.id] || []).includes(o.id);
                                            return (
                                                <button
                                                    key={o.id}
                                                    onClick={() => toggleOpcao(g.id, o.id, g.max)}
                                                    className={`text-xs font-bold px-3 py-1.5 rounded ${checked ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                                                >
                                                    {o.nome} {Number(o.precoAdicional) !== 0 && <span className="opacity-70">{Number(o.precoAdicional) > 0 ? '+' : ''}R${Number(o.precoAdicional).toFixed(2)}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="block text-[11px] font-bold uppercase mb-1">Quantidade</span>
                                    <input type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-sm" />
                                </label>
                            </div>
                            <label className="block">
                                <span className="block text-[11px] font-bold uppercase mb-1">Observação</span>
                                <input value={obs} onChange={e => setObs(e.target.value)} placeholder="ex.: sem cebola" className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-sm" />
                            </label>
                            <button onClick={adicionar} disabled={busy} className="w-full text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                                {busy ? 'Adicionando…' : `Adicionar — R$ ${(qty * (Number(selected.preco) + Object.entries(opcoes).reduce((s, [g, list]) => {
                                    const grupo = selected.grupos.find(gr => gr.id === Number(g));
                                    if (!grupo) return s;
                                    return s + list.reduce((ss, oid) => ss + Number(grupo.opcoes.find(o => o.id === oid)?.precoAdicional || 0), 0);
                                }, 0))).toFixed(2)}`}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Diálogo: Pagamento
// ============================================================================

function PagamentoDialog({ comandaId, sugestao, onClose, onSaved }: {
    comandaId: number; sugestao: number; onClose: () => void; onSaved: () => void;
}) {
    const [metodo, setMetodo] = useState<string>('DINHEIRO');
    const [valor, setValor] = useState(String(sugestao.toFixed(2)));
    const [troco, setTroco] = useState('0');
    const [txid, setTxid] = useState('');
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        const r = await fetch(`/api/comandas/${comandaId}/pagamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                metodo,
                valor: Number(valor),
                troco: metodo === 'DINHEIRO' ? Number(troco) : 0,
                transactionId: txid || null,
            }),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro');
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20 p-4" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border">
                <h2 className="text-lg font-black mb-4">Adicionar pagamento</h2>
                <div className="space-y-3">
                    <div>
                        <span className="block text-[11px] font-bold uppercase mb-1">Método</span>
                        <div className="grid grid-cols-3 gap-1">
                            {METODOS.map(m => (
                                <button key={m} onClick={() => setMetodo(m)} className={`text-xs font-bold px-3 py-2 rounded-lg ${metodo === m ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}>{m}</button>
                            ))}
                        </div>
                    </div>
                    <label className="block">
                        <span className="block text-[11px] font-bold uppercase mb-1">Valor</span>
                        <input type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-sm" />
                    </label>
                    {metodo === 'DINHEIRO' && (
                        <label className="block">
                            <span className="block text-[11px] font-bold uppercase mb-1">Troco</span>
                            <input type="number" step="0.01" min="0" value={troco} onChange={e => setTroco(e.target.value)} className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-sm" />
                        </label>
                    )}
                    {metodo !== 'DINHEIRO' && (
                        <label className="block">
                            <span className="block text-[11px] font-bold uppercase mb-1">Transaction ID (opcional)</span>
                            <input value={txid} onChange={e => setTxid(e.target.value)} placeholder="ex.: end-to-end PIX" className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-sm" />
                        </label>
                    )}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                    <button onClick={submit} disabled={busy || Number(valor) <= 0} className="text-sm font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Registrar'}</button>
                </div>
            </div>
        </div>
    );
}
