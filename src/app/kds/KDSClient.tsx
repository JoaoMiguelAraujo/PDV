'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Merchant { id: number; name: string; merchantId: string }

interface Callback {
    id: number;
    type: string;
    triggeredBy: string;
    httpStatus: number | null;
    erro: string | null;
    criadoEm: string;
}

interface Order {
    id: number;
    orderId: string;
    displayId: string | null;
    orderType: string | null;
    rawOrder: string;
    status: 'NEW' | 'CONFIRMED' | 'PREPARING' | 'DELIVERED' | 'CANCELLED';
    externalCode: string | null;
    totalValor: string | null;
    mesa: string | null;
    cliente: string | null;
    recebidoEm: string;
    confirmadoEm: string | null;
    preparandoEm: string | null;
    entregueEm: string | null;
    canceladoEm: string | null;
    cancelMotivo: string | null;
    cancelCode: string | null;
    merchant: Merchant;
    callbacks: Callback[];
}

interface ParsedOrder {
    id: string;
    type: string;
    displayId: string;
    merchant: { id: string; name: string };
    items: Array<{
        id: string;
        name: string;
        quantity: number;
        unit?: string;
        unitPrice: { value: number; currency: string };
        totalPrice: { value: number; currency: string };
        specialInstructions?: string;
    }>;
    total: { orderAmount: { value: number; currency: string } };
    indoor?: { mode: string; table?: string };
    extraInfo?: string;
    customer?: { name?: string };
    payments?: { prepaid: number; pending: number };
}

const REFRESH_MS = 3000;
const STATUS_TABS: Array<{ key: 'ALL' | Order['status']; label: string }> = [
    { key: 'ALL', label: 'Tudo' },
    { key: 'NEW', label: 'Novos' },
    { key: 'CONFIRMED', label: 'Confirmados' },
    { key: 'PREPARING', label: 'Em preparo' },
    { key: 'DELIVERED', label: 'Entregues' },
    { key: 'CANCELLED', label: 'Cancelados' },
];

const CANCEL_CODES = [
    'SYSTEMIC_ISSUES',
    'DUPLICATE_APPLICATION',
    'UNAVAILABLE_ITEM',
    'RESTAURANT_WITHOUT_DELIVERY_PERSON',
    'OUTDATED_MENU',
    'ORDER_OUTSIDE_THE_DELIVERY_AREA',
    'BLOCKED_CUSTOMER',
    'OUTSIDE_DELIVERY_HOURS',
    'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT',
    'RISK_AREA',
    'DELIVERY_PROBLEM',
] as const;

export default function KDSClient() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'ALL' | Order['status']>('NEW');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [toast, setToast] = useState<string | null>(null);
    const [busy, setBusy] = useState<Record<number, boolean>>({});
    const [cancelFor, setCancelFor] = useState<Order | null>(null);
    const [deleteFor, setDeleteFor] = useState<Order | null>(null);
    const [autoMode, setAutoMode] = useState(false);
    const [soundOn, setSoundOn] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true;
        return window.localStorage.getItem('pdv_kds_sound') !== '0';
    });
    const knownIdsRef = useRef<Set<number> | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    const fetchData = useCallback(async () => {
        try {
            const [ordersRes, settingsRes] = await Promise.all([
                fetch('/api/orders?limit=200', { cache: 'no-store' }),
                fetch('/api/settings', { cache: 'no-store' }),
            ]);
            if (!ordersRes.ok) throw new Error('Falha ao carregar pedidos');
            const od = await ordersRes.json();
            const newOrders: Order[] = od.orders || [];
            // Som no NEW: primeiro fetch → só popula o set; subsequentes → toca se
            // entrou um NEW que ainda não tínhamos visto.
            const newIds = new Set(newOrders.map(o => o.id));
            if (knownIdsRef.current !== null) {
                const novosNew = newOrders.filter(o => o.status === 'NEW' && !knownIdsRef.current!.has(o.id));
                if (novosNew.length > 0 && soundOn) playBeep();
            }
            knownIdsRef.current = newIds;
            setOrders(newOrders);
            if (settingsRes.ok) {
                const sd = await settingsRes.json();
                setAutoMode(!!sd.settings?.autoMode);
            }
        } catch (err: any) {
            showToast(`Erro: ${err.message || err}`);
        } finally {
            setLoading(false);
        }
    }, [soundOn]);

    function toggleSound(next: boolean) {
        setSoundOn(next);
        try { window.localStorage.setItem('pdv_kds_sound', next ? '1' : '0'); } catch {}
        if (next) playBeep(); // confirma audível
    }

    useEffect(() => {
        fetchData();
        if (!autoRefresh) return;
        const id = setInterval(fetchData, REFRESH_MS);
        return () => clearInterval(id);
    }, [fetchData, autoRefresh]);

    async function action(orderId: number, path: string, body?: any) {
        setBusy(b => ({ ...b, [orderId]: true }));
        try {
            const res = await fetch(`/api/orders/${orderId}/${path}`, {
                method: 'POST',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const data = await res.json().catch(() => ({}));
            if (data.ok) {
                showToast(`Callback ${path} enviado (HTTP ${data.httpStatus})`);
            } else {
                showToast(`Falha no ${path}: ${data.erro || data.message || 'erro'}`);
            }
            await fetchData();
        } catch (err: any) {
            showToast(`Erro: ${err.message || err}`);
        } finally {
            setBusy(b => ({ ...b, [orderId]: false }));
        }
    }

    // Exclusão LOCAL — DELETE /api/orders/{id}. Não envia evento pro menuGo,
    // apenas remove o registro daqui. Usado pra limpar pedidos de teste/lixo
    // durante homologação. Pra notificar o menuGo, usar "Cancelar".
    async function deleteOrder(orderId: number) {
        setBusy(b => ({ ...b, [orderId]: true }));
        try {
            const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                showToast('Pedido excluído localmente');
            } else {
                showToast(`Falha ao excluir: ${data.error || data.message || res.status}`);
            }
            await fetchData();
        } catch (err: any) {
            showToast(`Erro: ${err.message || err}`);
        } finally {
            setBusy(b => ({ ...b, [orderId]: false }));
        }
    }

    async function toggleAutoMode(next: boolean) {
        setAutoMode(next);
        await fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoMode: next }),
        });
        showToast(`Modo automático: ${next ? 'ATIVO' : 'desativado'}`);
    }

    async function testEvent() {
        const res = await fetch('/api/test-event', { method: 'POST' });
        const data = await res.json();
        showToast(data.ok ? `Event teste enviado (HTTP ${data.httpStatus})` : `Falhou: ${data.error || data.httpStatus}`);
        fetchData();
    }

    const filtered = useMemo(() => {
        if (statusFilter === 'ALL') return orders;
        return orders.filter(o => o.status === statusFilter);
    }, [orders, statusFilter]);

    const counts = useMemo(() => {
        const m: Record<string, number> = { ALL: orders.length };
        for (const o of orders) m[o.status] = (m[o.status] || 0) + 1;
        return m;
    }, [orders]);

    return (
        <div className="min-h-screen">
            {/* Subheader: filtros + toggles */}
            <div className="border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-[57px] lg:top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
                    {STATUS_TABS.map(tab => {
                        const active = statusFilter === tab.key;
                        const count = counts[tab.key] || 0;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setStatusFilter(tab.key)}
                                className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 ${
                                    active
                                        ? 'bg-primary text-white'
                                        : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'
                                }`}
                            >
                                {tab.label}
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                    active ? 'bg-white/20' : 'bg-slate-200 dark:bg-white/10'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                    <div className="flex-1" />
                    <label className="text-xs font-bold flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoMode}
                            onChange={e => toggleAutoMode(e.target.checked)}
                            className="accent-primary"
                        />
                        Modo auto
                    </label>
                    <label className="text-xs font-bold flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={e => setAutoRefresh(e.target.checked)}
                            className="accent-primary"
                        />
                        Auto-refresh
                    </label>
                    <label className="text-xs font-bold flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={soundOn}
                            onChange={e => toggleSound(e.target.checked)}
                            className="accent-primary"
                        />
                        <span className="material-symbols-outlined text-[14px]">{soundOn ? 'volume_up' : 'volume_off'}</span>
                        Som
                    </label>
                    <button
                        onClick={testEvent}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-1.5"
                    >
                        <span className="material-symbols-outlined text-[14px]">science</span>
                        Event de teste
                    </button>
                    <button
                        onClick={fetchData}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-1.5"
                    >
                        <span className="material-symbols-outlined text-[14px]">refresh</span>
                        Atualizar
                    </button>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
                ) : filtered.length === 0 ? (
                    <EmptyState filter={statusFilter} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filtered.map(o => (
                            <OrderCard
                                key={o.id}
                                order={o}
                                busy={!!busy[o.id]}
                                onConfirm={() => action(o.id, 'confirm')}
                                onPreparing={() => action(o.id, 'preparing')}
                                onDelivered={() => action(o.id, 'delivered')}
                                onCancel={() => setCancelFor(o)}
                                onDelete={() => setDeleteFor(o)}
                            />
                        ))}
                    </div>
                )}
            </main>

            {cancelFor && (
                <CancelDialog
                    order={cancelFor}
                    onClose={() => setCancelFor(null)}
                    onSubmit={async (reason, code) => {
                        await action(cancelFor.id, 'cancel', { reason, code, mode: 'MANUAL' });
                        setCancelFor(null);
                    }}
                />
            )}

            {deleteFor && (
                <DeleteDialog
                    order={deleteFor}
                    onClose={() => setDeleteFor(null)}
                    onConfirm={async () => {
                        await deleteOrder(deleteFor.id);
                        setDeleteFor(null);
                    }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50 max-w-md">
                    {toast}
                </div>
            )}
        </div>
    );
}

function EmptyState({ filter }: { filter: string }) {
    return (
        <div className="text-center py-20">
            <span className="material-symbols-outlined text-[64px] text-slate-300 dark:text-slate-700">inbox</span>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">
                {filter === 'NEW'
                    ? 'Sem pedidos novos. Configure um merchant em Merchants e teste com "Event de teste".'
                    : 'Nenhum pedido neste status.'}
            </p>
        </div>
    );
}

function OrderCard({
    order,
    busy,
    onConfirm,
    onPreparing,
    onDelivered,
    onCancel,
    onDelete,
}: {
    order: Order;
    busy: boolean;
    onConfirm: () => void;
    onPreparing: () => void;
    onDelivered: () => void;
    onCancel: () => void;
    onDelete: () => void;
}) {
    const parsed = useMemo<ParsedOrder | null>(() => {
        try {
            const p = JSON.parse(order.rawOrder);
            if (!p || !Array.isArray(p.items)) return null;
            return p;
        } catch { return null; }
    }, [order.rawOrder]);

    const recebido = new Date(order.recebidoEm).toLocaleTimeString('pt-BR');
    const tone = STATUS_TONE[order.status];

    return (
        <article className={`bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border ${tone.border} transition`}>
            <header className={`${tone.headerBg} px-5 py-3 flex items-center justify-between gap-2`}>
                <div className="min-w-0">
                    <div className="text-sm font-black truncate flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">{tone.icon}</span>
                        Pedido #{order.displayId || order.id}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {order.merchant.name} · {recebido}
                    </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${tone.badgeBg}`}>
                    {STATUS_LABEL[order.status]}
                </span>
            </header>

            {parsed ? (
                <div className="px-5 py-4 space-y-3">
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        {parsed.indoor?.table && (
                            <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">table_restaurant</span>
                                Mesa {parsed.indoor.table}
                            </span>
                        )}
                        {(parsed.customer?.name || parsed.extraInfo) && (
                            <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">person</span>
                                {parsed.customer?.name || parsed.extraInfo}
                            </span>
                        )}
                        <span className="ml-auto font-mono text-[10px] opacity-70">{parsed.type}</span>
                    </div>

                    <ul className="space-y-1.5">
                        {parsed.items.map(it => (
                            <li key={it.id} className="flex items-start gap-2 text-sm">
                                <span className="font-black text-primary tabular-nums w-8 flex-shrink-0">{it.quantity}×</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{it.name}</div>
                                    {it.specialInstructions && (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">{it.specialInstructions}</div>
                                    )}
                                </div>
                                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex-shrink-0">
                                    R$ {it.totalPrice.value.toFixed(2)}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Total</span>
                        <span className="text-base font-black tabular-nums">R$ {parsed.total.orderAmount.value.toFixed(2)}</span>
                    </div>
                    {parsed.payments && parsed.payments.prepaid > 0 && (
                        <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">paid</span>
                            Pré-pago R$ {parsed.payments.prepaid.toFixed(2)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400">
                    Aguardando detalhes do pedido…
                </div>
            )}

            {order.callbacks.length > 0 && (
                <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">
                        Callbacks emitidos
                    </div>
                    <ol className="space-y-1">
                        {order.callbacks.map(cb => (
                            <CallbackRow key={cb.id} cb={cb} />
                        ))}
                    </ol>
                </div>
            )}

            <ActionBar
                status={order.status}
                busy={busy}
                onConfirm={onConfirm}
                onPreparing={onPreparing}
                onDelivered={onDelivered}
                onCancel={onCancel}
                onDelete={onDelete}
            />
        </article>
    );
}

function ActionBar({
    status, busy, onConfirm, onPreparing, onDelivered, onCancel, onDelete,
}: {
    status: Order['status'];
    busy: boolean;
    onConfirm: () => void;
    onPreparing: () => void;
    onDelivered: () => void;
    onCancel: () => void;
    onDelete: () => void;
}) {
    const canConfirm = status === 'NEW';
    const canPreparing = status === 'CONFIRMED';
    const canDelivered = status === 'CONFIRMED' || status === 'PREPARING';
    const canCancel = status !== 'DELIVERED' && status !== 'CANCELLED';

    return (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 flex-wrap">
            <ActionBtn label="Confirmar" icon="task_alt" tone="primary" disabled={!canConfirm || busy} onClick={onConfirm} />
            <ActionBtn label="Em preparo" icon="soup_kitchen" tone="amber" disabled={!canPreparing || busy} onClick={onPreparing} />
            <ActionBtn label="Entregue" icon="done_all" tone="emerald" disabled={!canDelivered || busy} onClick={onDelivered} />
            <ActionBtn label="Cancelar" icon="cancel" tone="red" disabled={!canCancel || busy} onClick={onCancel} className="ml-auto" />
            {/* Exclusão LOCAL — não notifica o menuGo. Sempre habilitado;
                usado pra limpar pedidos de teste/lixo. */}
            <ActionBtn label="Excluir" icon="delete" tone="slate" disabled={busy} onClick={onDelete} />
        </div>
    );
}

function ActionBtn({
    label, icon, tone, disabled, onClick, className,
}: {
    label: string;
    icon: string;
    tone: 'primary' | 'amber' | 'emerald' | 'red' | 'slate';
    disabled: boolean;
    onClick: () => void;
    className?: string;
}) {
    const toneCls = TONE_BTN[tone];
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 ${toneCls} disabled:opacity-40 disabled:pointer-events-none ${className || ''}`}
        >
            <span className="material-symbols-outlined text-[14px]">{icon}</span>
            {label}
        </button>
    );
}

function CallbackRow({ cb }: { cb: Callback }) {
    const ok = cb.httpStatus != null && cb.httpStatus >= 200 && cb.httpStatus < 300;
    const time = new Date(cb.criadoEm).toLocaleTimeString('pt-BR');
    const icon =
        cb.type === 'confirm' ? 'task_alt'
        : cb.type === 'preparing' ? 'soup_kitchen'
        : cb.type === 'delivered' ? 'done_all'
        : cb.type === 'requestCancellation' ? 'cancel'
        : 'sync_alt';
    return (
        <li className="flex items-center gap-2 text-xs">
            <span className={`material-symbols-outlined text-[14px] ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{icon}</span>
            <span className="font-mono font-bold">{cb.type}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${ok ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'}`}>
                {cb.httpStatus ?? (cb.erro ? 'ERR' : '…')}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase">{cb.triggeredBy}</span>
            <span className="text-slate-400 dark:text-slate-500 font-mono ml-auto">{time}</span>
        </li>
    );
}

function CancelDialog({
    order, onClose, onSubmit,
}: { order: Order; onClose: () => void; onSubmit: (reason: string, code: string) => Promise<void> }) {
    const [reason, setReason] = useState('');
    const [code, setCode] = useState<string>('SYSTEMIC_ISSUES');
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!reason.trim()) return;
        setSubmitting(true);
        try {
            await onSubmit(reason.trim(), code);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <form
                onSubmit={handleSubmit}
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-white/10"
            >
                <h2 className="text-lg font-black mb-1">Cancelar pedido #{order.displayId || order.id}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Envia POST <code>/v1/orders/{order.orderId}/requestCancellation</code> ao menuGo.
                </p>

                <label className="block text-sm font-bold mb-1">Código (spec OD)</label>
                <select
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm mb-3"
                >
                    {CANCEL_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <label className="block text-sm font-bold mb-1">Motivo (livre)</label>
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm"
                    placeholder="Ex.: produto sem estoque"
                />

                <div className="flex gap-2 mt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5"
                    >
                        Voltar
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || !reason.trim()}
                        className="flex-1 text-sm font-bold px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        {submitting ? 'Enviando…' : 'Cancelar pedido'}
                    </button>
                </div>
            </form>
        </div>
    );
}

const STATUS_LABEL: Record<Order['status'], string> = {
    NEW: 'Novo',
    CONFIRMED: 'Confirmado',
    PREPARING: 'Em preparo',
    DELIVERED: 'Entregue',
    CANCELLED: 'Cancelado',
};

const STATUS_TONE: Record<Order['status'], { border: string; headerBg: string; badgeBg: string; icon: string }> = {
    NEW: {
        border: 'border-blue-200 dark:border-blue-500/30',
        headerBg: 'bg-blue-50 dark:bg-blue-500/10',
        badgeBg: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
        icon: 'fiber_new',
    },
    CONFIRMED: {
        border: 'border-slate-200 dark:border-white/10',
        headerBg: 'bg-slate-50 dark:bg-white/5',
        badgeBg: 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200',
        icon: 'task_alt',
    },
    PREPARING: {
        border: 'border-amber-200 dark:border-amber-500/30',
        headerBg: 'bg-amber-50 dark:bg-amber-500/10',
        badgeBg: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
        icon: 'soup_kitchen',
    },
    DELIVERED: {
        border: 'border-emerald-200 dark:border-emerald-500/30',
        headerBg: 'bg-emerald-50 dark:bg-emerald-500/10',
        badgeBg: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
        icon: 'done_all',
    },
    CANCELLED: {
        border: 'border-red-200 dark:border-red-500/30',
        headerBg: 'bg-red-50 dark:bg-red-500/10',
        badgeBg: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
        icon: 'cancel',
    },
};

/**
 * Beep simples via Web Audio API — sem dependência de arquivo. 2 pulsos
 * curtos de ~800Hz. Browsers podem bloquear até interação do usuário; o
 * primeiro beep "real" só toca depois que ele interagiu com a página
 * (toggle de som conta como interação).
 */
function playBeep() {
    try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const beep = (delay: number) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = 880;
            o.connect(g); g.connect(ctx.destination);
            g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
            g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.18);
            o.start(ctx.currentTime + delay);
            o.stop(ctx.currentTime + delay + 0.2);
        };
        beep(0);
        beep(0.25);
        // Encerra contexto pra não vazar.
        setTimeout(() => { try { ctx.close(); } catch {} }, 1000);
    } catch {}
}

const TONE_BTN = {
    primary: 'bg-primary text-white hover:opacity-90',
    amber: 'bg-amber-500 text-white hover:bg-amber-600',
    emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
    red: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20',
    slate: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10',
} as const;

function DeleteDialog({
    order, onClose, onConfirm,
}: { order: Order; onClose: () => void; onConfirm: () => Promise<void> }) {
    const [submitting, setSubmitting] = useState(false);

    async function handleConfirm() {
        setSubmitting(true);
        try { await onConfirm(); } finally { setSubmitting(false); }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-white/10"
            >
                <h2 className="text-lg font-black mb-1">Excluir pedido #{order.displayId || order.id}?</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Exclusão <strong>local</strong> — o pedido será removido apenas deste PDV.
                    O menuGo <strong>não</strong> é notificado. Pra cancelar e avisar o menuGo, use o botão "Cancelar".
                </p>

                <div className="flex gap-2 mt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5"
                    >
                        Voltar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={submitting}
                        className="flex-1 text-sm font-bold px-3 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {submitting ? 'Excluindo…' : 'Excluir'}
                    </button>
                </div>
            </div>
        </div>
    );
}
