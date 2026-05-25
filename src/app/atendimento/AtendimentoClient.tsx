'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';

interface OrderLite {
    id: number;
    orderId: string;
    displayId: string | null;
    status: string;
    mesa: string | null;
    cliente: string | null;
    totalValor: string | null;
    waiterId: number | null;
    waiterName: string | null;
    orderPad: string | null;
    closeSaleRequested: boolean;
    closeSaleRequestedAt: string | null;
    recebidoEm: string;
    merchantId: number;
    merchantName: string;
    merchantAdapterType: string;
}

interface SessaoMesa {
    mesa: string;
    merchantId: number;
    merchantName: string;
    waiterId: number | null;
    waiterName: string | null;
    orderPad: string | null;
    closeSaleRequested: boolean;
    orders: OrderLite[];
    total: number;
}

interface Waiter {
    id: number;
    name: string;
    externalCode: string | null;
}

const STATUS_PILL: Record<string, string> = {
    NEW: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300',
    CONFIRMED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    PREPARING: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    DELIVERED: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

export default function AtendimentoClient() {
    const [sessoes, setSessoes] = useState<SessaoMesa[]>([]);
    const [loading, setLoading] = useState(true);
    const [waitersPorMerchant, setWaitersPorMerchant] = useState<Record<number, Waiter[]>>({});
    const [modal, setModal] = useState<
        | { tipo: 'waiter'; sessao: SessaoMesa }
        | { tipo: 'orderPad'; sessao: SessaoMesa }
        | null
    >(null);
    const [acaoEmAndamento, setAcaoEmAndamento] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

    const fetchSessoes = useCallback(async () => {
        try {
            const res = await fetch('/api/atendimento/sessoes', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            setSessoes(data.sessoes || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessoes();
        const t = setInterval(fetchSessoes, 8000);
        return () => clearInterval(t);
    }, [fetchSessoes]);

    async function carregarWaiters(merchantId: number) {
        if (waitersPorMerchant[merchantId]) return;
        const res = await fetch(`/api/merchants/${merchantId}/waiters`);
        if (!res.ok) {
            showToast('Falha ao carregar garçons do menuGo.');
            return;
        }
        const data = await res.json();
        setWaitersPorMerchant(prev => ({ ...prev, [merchantId]: data.waiters || [] }));
    }

    async function setWaiter(sessao: SessaoMesa, waiter: Waiter | null) {
        const orderRef = sessao.orders[0];
        if (!orderRef) return;
        setAcaoEmAndamento(`waiter-${sessao.mesa}`);
        try {
            const res = await fetch(`/api/orders/${orderRef.id}/setWaiter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: waiter?.id ?? null, name: waiter?.name ?? '' }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                showToast(d?.erro || d?.message || `Erro ${res.status}`);
                return;
            }
            showToast(waiter ? `Garçom ${waiter.name} vinculado.` : 'Garçom removido.');
            setModal(null);
            fetchSessoes();
        } finally {
            setAcaoEmAndamento(null);
        }
    }

    async function setOrderPad(sessao: SessaoMesa, valor: string) {
        const orderRef = sessao.orders[0];
        if (!orderRef) return;
        setAcaoEmAndamento(`orderPad-${sessao.mesa}`);
        try {
            const res = await fetch(`/api/orders/${orderRef.id}/setOrderPad`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderPad: valor.trim() || null }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                showToast(d?.erro || d?.message || `Erro ${res.status}`);
                return;
            }
            showToast(valor.trim() ? `Comanda ${valor.trim()} atribuída.` : 'Comanda removida.');
            setModal(null);
            fetchSessoes();
        } finally {
            setAcaoEmAndamento(null);
        }
    }

    async function solicitarFechamento(sessao: SessaoMesa) {
        const orderRef = sessao.orders[0];
        if (!orderRef) return;
        if (!confirm(`Solicitar fechamento da mesa ${sessao.mesa}? Novos pedidos serão bloqueados até o operador cancelar a solicitação.`)) return;
        setAcaoEmAndamento(`closeSale-${sessao.mesa}`);
        try {
            const res = await fetch(`/api/orders/${orderRef.id}/closeSale`, { method: 'POST' });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                showToast(d?.erro || d?.message || `Erro ${res.status}`);
                return;
            }
            showToast('Fechamento solicitado.');
            fetchSessoes();
        } finally {
            setAcaoEmAndamento(null);
        }
    }

    async function deletarPedido(order: OrderLite) {
        if (!confirm(`EXCLUIR pedido #${order.displayId || order.id} (apenas localmente, sem cancelamento no menuGo)?\n\nEssa ação é só pra limpar lixo de teste — em produção use cancelamento.`)) return;
        setAcaoEmAndamento(`delete-${order.id}`);
        try {
            const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                showToast(d?.message || `Erro ${res.status}`);
                return;
            }
            showToast('Pedido removido localmente.');
            fetchSessoes();
        } finally {
            setAcaoEmAndamento(null);
        }
    }

    return (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            <PageHeader
                icon="table_restaurant"
                title="Atendimento"
                subtitle="Sessões de mesa abertas — disponível para merchants com adapter `menugo`."
            />

            {toast && (
                <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-bold">
                    {toast}
                </div>
            )}

            {loading ? (
                <p className="text-center text-sm font-bold text-slate-400 py-12">Carregando sessões...</p>
            ) : sessoes.length === 0 ? (
                <div className="text-center py-16">
                    <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-700">restaurant</span>
                    <p className="text-sm font-bold text-slate-500 mt-4">Nenhuma sessão de mesa aberta no momento.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sessoes.map(sessao => (
                        <div
                            key={`${sessao.merchantId}-${sessao.mesa}`}
                            className={`bg-white dark:bg-slate-900 rounded-3xl border-2 p-5 shadow-sm transition-all hover:shadow-lg ${sessao.closeSaleRequested ? 'border-amber-300 dark:border-amber-500/40 ring-1 ring-amber-200/50' : 'border-slate-100 dark:border-white/10'}`}
                        >
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">table_bar</span>
                                        <h3 className="text-xl font-black tracking-tight">Mesa {sessao.mesa}</h3>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                        {sessao.merchantName}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total</p>
                                    <p className="text-lg font-black text-primary">R$ {sessao.total.toFixed(2)}</p>
                                </div>
                            </div>

                            {sessao.closeSaleRequested && (
                                <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-600 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>notifications_active</span>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Fechamento solicitado</span>
                                </div>
                            )}

                            <div className="space-y-2 mb-4">
                                <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-white/5 rounded-xl">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-slate-400 text-[16px]">person</span>
                                        <span className="text-xs font-bold truncate">
                                            {sessao.waiterName || <span className="text-slate-400 italic">Sem garçom</span>}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { carregarWaiters(sessao.merchantId); setModal({ tipo: 'waiter', sessao }); }}
                                        disabled={acaoEmAndamento === `waiter-${sessao.mesa}`}
                                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline disabled:opacity-50"
                                    >
                                        {sessao.waiterName ? 'Trocar' : 'Vincular'}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 dark:bg-white/5 rounded-xl">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-slate-400 text-[16px]">receipt_long</span>
                                        <span className="text-xs font-mono font-bold">
                                            {sessao.orderPad || <span className="text-slate-400 italic font-sans">Sem comanda</span>}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setModal({ tipo: 'orderPad', sessao })}
                                        disabled={acaoEmAndamento === `orderPad-${sessao.mesa}`}
                                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline disabled:opacity-50"
                                    >
                                        {sessao.orderPad ? 'Editar' : 'Definir'}
                                    </button>
                                </div>
                            </div>

                            <details className="mb-3 group">
                                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px] group-open:rotate-90 transition-transform">chevron_right</span>
                                    {sessao.orders.length} {sessao.orders.length === 1 ? 'pedido' : 'pedidos'}
                                </summary>
                                <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-100 dark:border-white/10">
                                    {sessao.orders.map(order => (
                                        <div key={order.id} className="flex items-center justify-between gap-2 text-xs py-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono font-bold text-slate-600 dark:text-slate-400">#{order.displayId || order.id}</span>
                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${STATUS_PILL[order.status] || STATUS_PILL.NEW}`}>
                                                    {order.status}
                                                </span>
                                                <span className="text-slate-500 truncate">R$ {Number(order.totalValor || 0).toFixed(2)}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => deletarPedido(order)}
                                                disabled={acaoEmAndamento === `delete-${order.id}`}
                                                title="Excluir localmente (sem cancelamento OD)"
                                                className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            <button
                                type="button"
                                onClick={() => solicitarFechamento(sessao)}
                                disabled={sessao.closeSaleRequested || acaoEmAndamento === `closeSale-${sessao.mesa}`}
                                className="w-full px-3 py-2 bg-amber-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-600 disabled:bg-slate-200 dark:disabled:bg-white/5 disabled:text-slate-400 transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[16px]">payments</span>
                                {sessao.closeSaleRequested ? 'Fechamento já solicitado' : 'Solicitar fechamento'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal: vincular garçom */}
            {modal?.tipo === 'waiter' && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black mb-1">Vincular garçom — Mesa {modal.sessao.mesa}</h3>
                        <p className="text-[11px] text-slate-500 mb-4">Lista carregada do menuGo via GET /v1/merchants/{modal.sessao.merchantId}/waiters.</p>
                        <div className="space-y-1 max-h-96 overflow-y-auto">
                            {(waitersPorMerchant[modal.sessao.merchantId] || []).map(w => (
                                <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => setWaiter(modal.sessao, w)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${modal.sessao.waiterId === w.id ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/30' : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 hover:border-primary/20'}`}
                                >
                                    <span className="material-symbols-outlined text-primary">person</span>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold">{w.name}</p>
                                        {w.externalCode && (
                                            <p className="text-[10px] font-mono text-slate-400">{w.externalCode}</p>
                                        )}
                                    </div>
                                    {modal.sessao.waiterId === w.id && (
                                        <span className="material-symbols-outlined text-primary">check_circle</span>
                                    )}
                                </button>
                            ))}
                            {(waitersPorMerchant[modal.sessao.merchantId] || []).length === 0 && (
                                <p className="text-xs text-slate-400 text-center py-4">Carregando ou nenhum garçom cadastrado no menuGo.</p>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-white/10">
                            {modal.sessao.waiterId !== null && (
                                <button
                                    type="button"
                                    onClick={() => setWaiter(modal.sessao, null)}
                                    className="text-[11px] font-black uppercase tracking-widest text-red-500 hover:underline"
                                >
                                    Remover garçom
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setModal(null)}
                                className="ml-auto text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 px-3 py-2"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: definir comanda */}
            {modal?.tipo === 'orderPad' && (
                <ModalOrderPad
                    sessao={modal.sessao}
                    onClose={() => setModal(null)}
                    onApply={(valor) => setOrderPad(modal.sessao, valor)}
                />
            )}
        </main>
    );
}

function ModalOrderPad({
    sessao, onClose, onApply,
}: {
    sessao: SessaoMesa;
    onClose: () => void;
    onApply: (valor: string) => void;
}) {
    const [valor, setValor] = useState(sessao.orderPad || '');
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-black mb-1">Nº da comanda — Mesa {sessao.mesa}</h3>
                <p className="text-[11px] text-slate-500 mb-4">Identificador da comanda física entregue ao cliente. Libera envios "segurados" no menuGo.</p>
                <input
                    type="text"
                    value={valor}
                    onChange={e => setValor(e.target.value.slice(0, 50))}
                    placeholder="ex: 042"
                    maxLength={50}
                    autoFocus
                    className="w-full font-mono text-lg p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:ring-1 ring-primary/30"
                />
                <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-white/10">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 px-3 py-2"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply(valor)}
                        className="bg-primary text-white px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-primary/90"
                    >
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
}
