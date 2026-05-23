'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/PageHeader';

interface MerchantLite { id: number; name: string }
interface Movimento {
    id: number;
    tipo: 'SUPRIMENTO' | 'SANGRIA' | 'VENDA_DINHEIRO' | 'RETIRADA_TROCO' | 'AJUSTE';
    valor: string;
    pagamentoId: number | null;
    observacao: string | null;
    criadoEm: string;
}
interface Caixa {
    id: number;
    merchantId: number;
    status: 'ABERTO' | 'FECHADO';
    operadorNome: string | null;
    valorInicial: string;
    valorContado: string | null;
    diferenca: string | null;
    observacao: string | null;
    abertoEm: string;
    fechadoEm: string | null;
    movimentos: Movimento[];
    esperado: number;
    totaisPorTipo: Record<string, number>;
}
interface CaixaResumo {
    id: number;
    status: 'ABERTO' | 'FECHADO';
    valorInicial: string;
    valorContado: string | null;
    diferenca: string | null;
    operadorNome: string | null;
    abertoEm: string;
    fechadoEm: string | null;
    merchantId: number;
    _count: { movimentos: number };
}

const SIGNS: Record<string, 1 | -1> = {
    SUPRIMENTO: 1, SANGRIA: -1, VENDA_DINHEIRO: 1, RETIRADA_TROCO: -1, AJUSTE: 1,
};
const LABELS: Record<string, string> = {
    SUPRIMENTO: 'Suprimento',
    SANGRIA: 'Sangria',
    VENDA_DINHEIRO: 'Venda dinheiro',
    RETIRADA_TROCO: 'Troco devolvido',
    AJUSTE: 'Ajuste',
};

export default function CaixaClient() {
    const [merchants, setMerchants] = useState<MerchantLite[]>([]);
    const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
    const [caixas, setCaixas] = useState<CaixaResumo[]>([]);
    const [selectedCaixa, setSelectedCaixa] = useState<Caixa | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAbrir, setShowAbrir] = useState(false);
    const [showMovimento, setShowMovimento] = useState(false);
    const [showFechar, setShowFechar] = useState(false);
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

    const loadCaixas = useCallback(async () => {
        if (selectedMerchantId == null) return;
        setLoading(true);
        try {
            const r = await fetch(`/api/caixa?merchantId=${selectedMerchantId}`, { cache: 'no-store' });
            if (r.ok) {
                const d = await r.json();
                setCaixas(d.caixas || []);
                const aberto = (d.caixas || []).find((c: CaixaResumo) => c.status === 'ABERTO');
                if (aberto) {
                    await loadCaixaDetalhe(aberto.id);
                } else {
                    setSelectedCaixa(null);
                }
            }
        } finally {
            setLoading(false);
        }
    }, [selectedMerchantId]);

    async function loadCaixaDetalhe(id: number) {
        const r = await fetch(`/api/caixa/${id}`, { cache: 'no-store' });
        if (r.ok) setSelectedCaixa(await r.json());
    }

    useEffect(() => { loadMerchants(); }, [loadMerchants]);
    useEffect(() => { loadCaixas(); }, [loadCaixas]);

    return (
        <PageContainer>
            <PageHeader
                title="Caixa"
                subtitle="Abertura, sangria, suprimento e fechamento — pagamentos em dinheiro entram automaticamente."
                icon="savings"
            >
                <select
                    value={selectedMerchantId ?? ''}
                    onChange={e => setSelectedMerchantId(parseInt(e.target.value, 10))}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm font-medium"
                >
                    {merchants.length === 0 && <option value="">Cadastre um estabelecimento</option>}
                    {merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {selectedMerchantId != null && (!selectedCaixa || selectedCaixa.status === 'FECHADO') && (
                    <button onClick={() => setShowAbrir(true)} className="text-sm font-bold px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 hover:shadow-glow transition flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        Abrir caixa
                    </button>
                )}
            </PageHeader>

            {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Coluna principal: caixa atual */}
                    <section className="lg:col-span-8 space-y-4">
                        {selectedCaixa ? (
                            <CaixaAberto
                                caixa={selectedCaixa}
                                onMovimento={() => setShowMovimento(true)}
                                onFechar={() => setShowFechar(true)}
                                onReload={() => loadCaixaDetalhe(selectedCaixa.id)}
                            />
                        ) : (
                            <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                                <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-700">point_of_sale</span>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Sem caixa aberto.</p>
                            </div>
                        )}
                    </section>

                    {/* Lateral: histórico */}
                    <aside className="lg:col-span-4">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Histórico</h2>
                        <ul className="space-y-2">
                            {caixas.filter(c => c.status === 'FECHADO').slice(0, 30).map(c => (
                                <li
                                    key={c.id}
                                    onClick={() => loadCaixaDetalhe(c.id)}
                                    className={`p-3 rounded-xl border cursor-pointer ${selectedCaixa?.id === c.id ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold">#{c.id} {c.operadorNome ? `· ${c.operadorNome}` : ''}</span>
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${Number(c.diferenca) === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {Number(c.diferenca) === 0 ? 'OK' : `Δ R$ ${Number(c.diferenca).toFixed(2)}`}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1">
                                        {new Date(c.abertoEm).toLocaleString('pt-BR')} → {c.fechadoEm ? new Date(c.fechadoEm).toLocaleString('pt-BR') : ''}
                                    </div>
                                </li>
                            ))}
                            {caixas.filter(c => c.status === 'FECHADO').length === 0 && (
                                <li className="text-xs text-slate-400 italic">Sem caixas fechados ainda.</li>
                            )}
                        </ul>
                    </aside>
                </div>
            )}

            {showAbrir && selectedMerchantId != null && (
                <AbrirCaixaDialog
                    merchantId={selectedMerchantId}
                    onClose={() => setShowAbrir(false)}
                    onOpened={() => { setShowAbrir(false); loadCaixas(); }}
                />
            )}

            {showMovimento && selectedCaixa && (
                <MovimentoDialog
                    caixaId={selectedCaixa.id}
                    onClose={() => setShowMovimento(false)}
                    onSaved={() => { setShowMovimento(false); loadCaixaDetalhe(selectedCaixa.id); }}
                />
            )}

            {showFechar && selectedCaixa && (
                <FecharCaixaDialog
                    caixa={selectedCaixa}
                    onClose={() => setShowFechar(false)}
                    onClosed={() => { setShowFechar(false); loadCaixas(); }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">{toast}</div>
            )}
        </PageContainer>
    );
}

function CaixaAberto({ caixa, onMovimento, onFechar, onReload }: {
    caixa: Caixa;
    onMovimento: () => void;
    onFechar: () => void;
    onReload: () => void;
}) {
    const aberto = caixa.status === 'ABERTO';
    return (
        <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <h2 className="text-2xl font-black tabular-nums">R$ {Number(caixa.esperado).toFixed(2)}</h2>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Saldo esperado em dinheiro</p>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${aberto ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{caixa.status}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <Tile label="Inicial" valor={caixa.valorInicial} />
                    <Tile label="Vendas $" valor={caixa.totaisPorTipo.VENDA_DINHEIRO ?? 0} tone="green" />
                    <Tile label="Suprimento" valor={caixa.totaisPorTipo.SUPRIMENTO ?? 0} tone="green" />
                    <Tile label="Sangria" valor={caixa.totaisPorTipo.SANGRIA ?? 0} tone="red" />
                </div>

                {!aberto && caixa.valorContado != null && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 grid grid-cols-3 gap-3">
                        <Tile label="Contado" valor={caixa.valorContado!} />
                        <Tile label="Esperado" valor={caixa.esperado} />
                        <Tile label="Diferença" valor={caixa.diferenca ?? '0'} tone={Number(caixa.diferenca) === 0 ? 'green' : 'red'} />
                    </div>
                )}

                {aberto && (
                    <div className="flex gap-2 mt-4">
                        <button onClick={onMovimento} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10">
                            Suprimento / Sangria
                        </button>
                        <button onClick={onReload} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10">
                            Atualizar
                        </button>
                        <button onClick={onFechar} className="ml-auto text-xs font-bold px-3 py-2 rounded-lg bg-red-600 text-white">
                            Fechar caixa
                        </button>
                    </div>
                )}
                {caixa.observacao && <p className="text-[11px] mt-3 italic text-slate-500">{caixa.observacao}</p>}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
                    <h3 className="text-sm font-black">Movimentos ({caixa.movimentos.length})</h3>
                </div>
                {caixa.movimentos.length === 0 ? (
                    <p className="text-center py-8 text-slate-400 text-sm">Sem movimentos.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-white/5">
                        {caixa.movimentos.map(m => {
                            const sign = SIGNS[m.tipo];
                            return (
                                <li key={m.id} className="px-4 py-2 flex items-center gap-3">
                                    <span className={`text-[10px] font-black px-2 py-1 rounded ${sign > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {LABELS[m.tipo]}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        {m.observacao && <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{m.observacao}</p>}
                                        <p className="text-[10px] text-slate-400 font-mono">{new Date(m.criadoEm).toLocaleTimeString('pt-BR')}</p>
                                    </div>
                                    <span className={`text-sm font-black tabular-nums ${sign > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {sign > 0 ? '+' : '-'} R$ {Number(m.valor).toFixed(2)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </>
    );
}

function Tile({ label, valor, tone }: { label: string; valor: string | number; tone?: 'green' | 'red' }) {
    const cls = tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : '';
    return (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
            <div className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">{label}</div>
            <div className={`text-lg font-black tabular-nums ${cls}`}>R$ {Number(valor).toFixed(2)}</div>
        </div>
    );
}

function AbrirCaixaDialog({ merchantId, onClose, onOpened }: {
    merchantId: number;
    onClose: () => void;
    onOpened: () => void;
}) {
    const [valorInicial, setValorInicial] = useState('0');
    const [operadorNome, setOperadorNome] = useState('');
    const [observacao, setObservacao] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit() {
        setBusy(true);
        const r = await fetch('/api/caixa', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchantId, valorInicial: Number(valorInicial) || 0, operadorNome, observacao }),
        });
        setBusy(false);
        if (r.ok) onOpened();
        else alert((await r.json()).message || 'Erro');
    }
    return (
        <Modal onClose={onClose} title="Abrir caixa">
            <div className="space-y-3">
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Valor inicial (troco)</span><input type="number" step="0.01" min="0" value={valorInicial} onChange={e => setValorInicial(e.target.value)} className={INPUT_CLS} /></label>
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Operador (opcional)</span><input value={operadorNome} onChange={e => setOperadorNome(e.target.value)} className={INPUT_CLS} /></label>
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Observação (opcional)</span><textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className={INPUT_CLS} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                <button onClick={submit} disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{busy ? 'Abrindo…' : 'Abrir'}</button>
            </div>
        </Modal>
    );
}

function MovimentoDialog({ caixaId, onClose, onSaved }: {
    caixaId: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [tipo, setTipo] = useState<'SUPRIMENTO' | 'SANGRIA' | 'AJUSTE'>('SUPRIMENTO');
    const [valor, setValor] = useState('');
    const [observacao, setObservacao] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit() {
        setBusy(true);
        const r = await fetch(`/api/caixa/${caixaId}/movimentos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, valor: Number(valor), observacao }),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro');
    }
    return (
        <Modal onClose={onClose} title="Movimento de caixa">
            <div className="space-y-3">
                <div>
                    <span className="block text-[11px] font-bold uppercase mb-1">Tipo</span>
                    <div className="grid grid-cols-3 gap-1">
                        {(['SUPRIMENTO', 'SANGRIA', 'AJUSTE'] as const).map(t => (
                            <button key={t} onClick={() => setTipo(t)} className={`text-xs font-bold px-3 py-2 rounded-lg ${tipo === t ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}>{t}</button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                        SUPRIMENTO = entrada manual · SANGRIA = saída · AJUSTE = correção
                    </p>
                </div>
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Valor</span><input type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} className={INPUT_CLS} /></label>
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Observação</span><input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="ex.: envio ao cofre" className={INPUT_CLS} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                <button onClick={submit} disabled={busy || !valor} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Registrar'}</button>
            </div>
        </Modal>
    );
}

function FecharCaixaDialog({ caixa, onClose, onClosed }: { caixa: Caixa; onClose: () => void; onClosed: () => void }) {
    const [valorContado, setValorContado] = useState(String(caixa.esperado.toFixed(2)));
    const [observacao, setObservacao] = useState('');
    const [busy, setBusy] = useState(false);
    const diff = +(Number(valorContado) - caixa.esperado).toFixed(2);
    async function submit() {
        setBusy(true);
        const r = await fetch(`/api/caixa/${caixa.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'FECHADO', valorContado: Number(valorContado), observacao }),
        });
        setBusy(false);
        if (r.ok) onClosed();
        else alert((await r.json()).message || 'Erro');
    }
    return (
        <Modal onClose={onClose} title="Fechar caixa">
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm">
                    <span>Esperado</span>
                    <span className="font-black tabular-nums">R$ {caixa.esperado.toFixed(2)}</span>
                </div>
            </div>
            <div className="space-y-3">
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Valor contado *</span><input autoFocus type="number" step="0.01" min="0" value={valorContado} onChange={e => setValorContado(e.target.value)} className={INPUT_CLS} /></label>
                <div className={`text-sm font-bold ${diff === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Diferença: {diff > 0 ? '+' : ''}R$ {diff.toFixed(2)} {diff === 0 ? ' (caixa fechou perfeito)' : diff > 0 ? ' (sobra)' : ' (faltou)'}
                </div>
                <label className="block"><span className="block text-[11px] font-bold uppercase mb-1">Observação</span><textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className={INPUT_CLS} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
                <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                <button onClick={submit} disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50">{busy ? 'Fechando…' : 'Fechar caixa'}</button>
            </div>
        </Modal>
    );
}

const INPUT_CLS = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm';

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
