'use client';

import { useCallback, useEffect, useState } from 'react';

const SECRET_MASK = '••••••••••••';

interface Merchant {
    id: number;
    name: string;
    merchantId: string;
    appId: string;
    clientSecretEnc: string;
    menugoBaseURL: string;
    menugoClientId: string;
    menugoClientSecretEnc: string;
    ativo: boolean;
    observacao: string | null;
    criadoEm: string;
    atualizadoEm: string;
}

interface FormState {
    name: string;
    merchantId: string;
    appId: string;
    clientSecret: string;
    menugoBaseURL: string;
    menugoClientId: string;
    menugoClientSecret: string;
    observacao: string;
    ativo: boolean;
}

const EMPTY: FormState = {
    name: '',
    merchantId: '',
    appId: '',
    clientSecret: '',
    menugoBaseURL: '',
    menugoClientId: '',
    menugoClientSecret: '',
    observacao: '',
    ativo: true,
};

export default function MerchantsClient() {
    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Merchant | null>(null);
    const [creating, setCreating] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/merchants', { cache: 'no-store' });
            const data = await res.json();
            setMerchants(data.merchants || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleDelete(m: Merchant) {
        if (!confirm(`Remover merchant "${m.name}"? Só funciona se não houver pedidos vinculados — caso contrário, desative.`)) return;
        const res = await fetch(`/api/merchants/${m.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(`Erro: ${data.message || res.statusText}`);
            return;
        }
        showToast('Merchant removido.');
        fetchData();
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4">
                <h1 className="text-xl font-black">Merchants</h1>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    Credenciais Open Delivery dos restaurantes que este PDV atende
                </span>
                <button
                    onClick={() => setCreating(true)}
                    className="ml-auto text-xs font-bold px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90 flex items-center gap-1.5"
                >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Cadastrar merchant
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : merchants.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
                    <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-700">store</span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Nenhum merchant cadastrado.</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Cadastre o primeiro com os dados que o menuGo gerou na Central → Integração PDV.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {merchants.map(m => (
                        <article
                            key={m.id}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-4"
                        >
                            <div className="flex items-start gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                    <div className="font-black text-sm truncate flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${m.ativo ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                        {m.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                                        {m.merchantId}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setEditing(m)}
                                    className="text-xs font-bold px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(m)}
                                    className="text-xs px-2 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    title="Remover"
                                >
                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                            </div>
                            <dl className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 font-mono">
                                <div className="truncate"><span className="opacity-60">appId:</span> {m.appId}</div>
                                <div className="truncate"><span className="opacity-60">menuGo:</span> {m.menugoBaseURL}</div>
                                <div className="truncate"><span className="opacity-60">oauth client:</span> {m.menugoClientId}</div>
                            </dl>
                            {m.observacao && (
                                <p className="text-[11px] mt-2 text-slate-600 dark:text-slate-300 italic">{m.observacao}</p>
                            )}
                        </article>
                    ))}
                </div>
            )}

            {(editing || creating) && (
                <MerchantDialog
                    merchant={editing}
                    onClose={() => { setEditing(null); setCreating(false); }}
                    onSaved={(msg) => { showToast(msg); fetchData(); setEditing(null); setCreating(false); }}
                />
            )}

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">
                    {toast}
                </div>
            )}
        </div>
    );
}

function MerchantDialog({
    merchant, onClose, onSaved,
}: { merchant: Merchant | null; onClose: () => void; onSaved: (msg: string) => void }) {
    const isEdit = !!merchant;
    const [form, setForm] = useState<FormState>(() => merchant ? {
        name: merchant.name,
        merchantId: merchant.merchantId,
        appId: merchant.appId,
        clientSecret: merchant.clientSecretEnc ? SECRET_MASK : '',
        menugoBaseURL: merchant.menugoBaseURL,
        menugoClientId: merchant.menugoClientId,
        menugoClientSecret: merchant.menugoClientSecretEnc ? SECRET_MASK : '',
        observacao: merchant.observacao || '',
        ativo: merchant.ativo,
    } : EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function set<K extends keyof FormState>(k: K, v: FormState[K]) {
        setForm(s => ({ ...s, [k]: v }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaving(true);
        try {
            const url = isEdit ? `/api/merchants/${merchant!.id}` : '/api/merchants';
            const method = isEdit ? 'PATCH' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.message || `Erro ${res.status}`);
                return;
            }
            onSaved(isEdit ? 'Merchant atualizado.' : 'Merchant criado.');
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <form
                onSubmit={handleSubmit}
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-white/10 my-8"
            >
                <header className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                    <h2 className="text-lg font-black">
                        {isEdit ? `Editar merchant #${merchant!.id}` : 'Novo merchant'}
                    </h2>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>

                <div className="px-6 py-4 space-y-4">
                    <Field label="Nome amigável" hint="Aparece nos cards do KDS.">
                        <input type="text" required value={form.name} onChange={e => set('name', e.target.value)} className={INPUT_CLS} />
                    </Field>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="X-App-MerchantId" hint="Identifica o restaurante no header OD. Min 36 chars (CNPJ-UUID).">
                            <input
                                type="text"
                                required
                                minLength={36}
                                value={form.merchantId}
                                onChange={e => set('merchantId', e.target.value)}
                                className={`${INPUT_CLS} font-mono text-xs`}
                                placeholder="11111111111111-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
                            />
                        </Field>
                        <Field label="X-App-Id" hint="UUID v4 do menuGo (Ordering Application).">
                            <input
                                type="text"
                                required
                                value={form.appId}
                                onChange={e => set('appId', e.target.value)}
                                className={`${INPUT_CLS} font-mono text-xs`}
                                placeholder="0d549e3d-e562-4ec0-b421-e7b19fb933ff"
                            />
                        </Field>
                    </div>

                    <Field label="clientSecret (HMAC)" hint="Chave que o menuGo usa pra assinar POST /v1/newEvent. Cifrada em repouso.">
                        <input
                            type="text"
                            required={!isEdit}
                            value={form.clientSecret}
                            onChange={e => set('clientSecret', e.target.value)}
                            className={`${INPUT_CLS} font-mono text-xs`}
                            placeholder={isEdit ? 'Deixe ' + SECRET_MASK + ' para manter' : ''}
                        />
                    </Field>

                    <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
                            Callback OAuth2 → menuGo
                        </h3>
                        <div className="space-y-4">
                            <Field label="URL base do menuGo" hint="Ex.: https://app.menugo.com (sem /api).">
                                <input
                                    type="url"
                                    required
                                    value={form.menugoBaseURL}
                                    onChange={e => set('menugoBaseURL', e.target.value)}
                                    className={INPUT_CLS}
                                    placeholder="https://app.menugo.com"
                                />
                            </Field>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="OAuth2 client_id" hint="Em geral = X-App-Id.">
                                    <input
                                        type="text"
                                        required
                                        value={form.menugoClientId}
                                        onChange={e => set('menugoClientId', e.target.value)}
                                        className={`${INPUT_CLS} font-mono text-xs`}
                                    />
                                </Field>
                                <Field label="OAuth2 client_secret" hint="Cifrado em repouso.">
                                    <input
                                        type="text"
                                        required={!isEdit}
                                        value={form.menugoClientSecret}
                                        onChange={e => set('menugoClientSecret', e.target.value)}
                                        className={`${INPUT_CLS} font-mono text-xs`}
                                        placeholder={isEdit ? 'Deixe ' + SECRET_MASK + ' para manter' : ''}
                                    />
                                </Field>
                            </div>
                        </div>
                    </div>

                    <Field label="Observação" hint="Opcional. Notas para o operador.">
                        <textarea
                            rows={2}
                            value={form.observacao}
                            onChange={e => set('observacao', e.target.value)}
                            className={INPUT_CLS}
                        />
                    </Field>

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="accent-primary" />
                        <span className="font-bold">Ativo</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">— quando desativado, /v1/newEvent retorna 403 para este merchant.</span>
                    </label>

                    {error && (
                        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}
                </div>

                <footer className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">
                        Cancelar
                    </button>
                    <button type="submit" disabled={saving} className="text-sm font-bold px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                        {saving ? 'Salvando…' : (isEdit ? 'Atualizar' : 'Criar')}
                    </button>
                </footer>
            </form>
        </div>
    );
}

const INPUT_CLS = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-bold mb-1">{label}</label>
            {children}
            {hint && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
        </div>
    );
}
