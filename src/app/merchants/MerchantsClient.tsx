'use client';

import { useCallback, useEffect, useState } from 'react';

const SECRET_MASK = '••••••••••••';

// Enum MerchantCategory da spec OD v1.7 (linha 3411 do openapi.yaml).
const MERCHANT_CATEGORIES = [
    'BURGERS', 'PIZZA', 'FAST_FOOD', 'HOT_DOG', 'JAPANESE', 'DESSERTS',
    'AMERICAN', 'ICE_CREAM', 'BBQ', 'SANDWICH', 'MEXICAN', 'BRAZILIAN',
    'PASTRY', 'ARABIAN', 'COMFORT_FOOD', 'VEGETARIAN', 'VEGAN', 'BAKERY',
    'HEALTHY', 'ITALIAN', 'CHINESE', 'JUICE_SMOOTHIES', 'SEAFOOD', 'CAFE',
    'SALADS', 'COFFEE_TEA', 'PASTA', 'BREAKFAST_BRUNCH', 'LATIN_AMERICAN',
    'CONVENIENCE', 'PUB', 'HAWAIIAN', 'EUROPEAN', 'FAMILY_MEALS', 'FRENCH',
    'INDIAN', 'PORTUGUESE', 'SPANISH', 'GOURMET', 'KIDS_FRIENDLY',
    'SOUTH_AMERICAN', 'SPECIALTY_FOODS', 'ARGENTINIAN', 'PREMIUM',
    'AFFORDABLE_MEALS',
] as const;
const ACCEPTED_CARDS = [
    'VISA', 'MASTERCARD', 'DINERS', 'AMEX', 'HIPERCARD', 'ELO', 'AURA',
    'DISCOVER', 'VR_BENEFICIOS', 'SODEXO', 'TICKET', 'GOOD_CARD', 'BANESCARD',
    'SOROCARD', 'POLICARD', 'VALECARD', 'AGICARD', 'JCB', 'CREDSYSTEM',
    'CABAL', 'GREEN_CARD', 'VEROCHEQUE', 'AVISTA', 'OTHER',
] as const;
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const SERVICE_TYPES = ['DELIVERY', 'TAKEOUT', 'INDOOR'] as const;

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
    // BasicInfo
    document: string | null;
    corporateName: string | null;
    description: string | null;
    averageTicket: string | null;
    averagePreparationTime: number | null;
    minOrderValue: string | null;
    merchantCategories: string[];
    acceptedCards: string[];
    contactEmails: string[];
    address: {
        country: string | null; state: string | null; city: string | null;
        district: string | null; street: string | null; number: string | null;
        postalCode: string | null; complement: string | null; reference: string | null;
        latitude: string | null; longitude: string | null;
    };
    contactPhones: { commercialNumber: string | null; whatsappNumber: string | null };
    logoImageUrl: string | null;
    bannerImageUrl: string | null;
    odTtl: number;
}

interface ServiceItem {
    id: number;
    uuid: string;
    serviceType: string;
    status: string;
    ativo: boolean;
    menuUuid: string;
    serviceHours: any;
    serviceArea: any;
    serviceTiming: any;
}

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
                    Credenciais OD + BasicInfo + Services
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
                                <div className="truncate"><span className="opacity-60">CNPJ:</span> {m.document || '—'}</div>
                                <div className="truncate"><span className="opacity-60">menuGo:</span> {m.menugoBaseURL}</div>
                                <div className="truncate">
                                    <span className="opacity-60">cidade:</span> {m.address.city || '—'}{m.address.state ? `/${m.address.state}` : ''}
                                </div>
                            </dl>
                            {!isBasicInfoComplete(m) && (
                                <div className="mt-2 text-[10px] font-bold px-2 py-1 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">warning</span>
                                    BasicInfo incompleto — GET /v1/merchant retorna 503
                                </div>
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
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50 max-w-md">
                    {toast}
                </div>
            )}
        </div>
    );
}

function isBasicInfoComplete(m: Merchant): boolean {
    const a = m.address;
    return !!(
        m.document && m.corporateName && m.description &&
        m.averagePreparationTime != null && m.minOrderValue != null &&
        m.merchantCategories.length > 0 &&
        a.country && a.state && a.city && a.district && a.street && a.number && a.postalCode &&
        a.latitude != null && a.longitude != null &&
        m.contactEmails.length > 0 && m.contactPhones.commercialNumber && m.logoImageUrl
    );
}

// ============================================================================
// Dialog com tabs
// ============================================================================

type Tab = 'credenciais' | 'basicInfo' | 'address' | 'contact' | 'images' | 'services';

function MerchantDialog({
    merchant, onClose, onSaved,
}: { merchant: Merchant | null; onClose: () => void; onSaved: (msg: string) => void }) {
    const isEdit = !!merchant;
    const [tab, setTab] = useState<Tab>('credenciais');
    const [form, setForm] = useState<any>(() => initialForm(merchant));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function set(k: string, v: any) { setForm((s: any) => ({ ...s, [k]: v })); }
    function setAddr(k: string, v: any) { setForm((s: any) => ({ ...s, address: { ...s.address, [k]: v } })); }
    function setPhone(k: string, v: any) { setForm((s: any) => ({ ...s, contactPhones: { ...s.contactPhones, [k]: v } })); }

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

    const TABS: Array<{ key: Tab; label: string; icon: string }> = [
        { key: 'credenciais', label: 'Credenciais OD', icon: 'key' },
        { key: 'basicInfo', label: 'BasicInfo', icon: 'business' },
        { key: 'address', label: 'Endereço', icon: 'location_on' },
        { key: 'contact', label: 'Contatos', icon: 'contacts' },
        { key: 'images', label: 'Imagens', icon: 'image' },
        ...(isEdit ? [{ key: 'services' as Tab, label: 'Services', icon: 'room_service' }] : []),
    ];

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto" onClick={onClose}>
            <form
                onSubmit={handleSubmit}
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-white/10 my-4"
            >
                <header className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                    <h2 className="text-lg font-black">
                        {isEdit ? `Editar merchant #${merchant!.id}` : 'Novo merchant'}
                    </h2>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>

                <div className="border-b border-slate-100 dark:border-white/5 px-6 flex gap-1 overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 -mb-px transition ${
                                tab === t.key
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                        >
                            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="px-6 py-4 space-y-4 max-h-[calc(100vh-280px)] overflow-y-auto">
                    {tab === 'credenciais' && <TabCredenciais form={form} set={set} isEdit={isEdit} />}
                    {tab === 'basicInfo' && <TabBasicInfo form={form} set={set} />}
                    {tab === 'address' && <TabAddress form={form} setAddr={setAddr} />}
                    {tab === 'contact' && <TabContact form={form} set={set} setPhone={setPhone} />}
                    {tab === 'images' && <TabImages form={form} set={set} />}
                    {tab === 'services' && merchant && <TabServices merchantId={merchant.id} />}

                    {error && (
                        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}
                </div>

                <footer className="px-6 py-4 border-t border-slate-100 dark:border-white/5 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">
                        Fechar
                    </button>
                    {tab !== 'services' && (
                        <button type="submit" disabled={saving} className="text-sm font-bold px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                            {saving ? 'Salvando…' : (isEdit ? 'Atualizar' : 'Criar')}
                        </button>
                    )}
                </footer>
            </form>
        </div>
    );
}

function initialForm(m: Merchant | null): any {
    if (!m) {
        return {
            name: '', merchantId: '', appId: '', clientSecret: '',
            menugoBaseURL: '', menugoClientId: '', menugoClientSecret: '',
            observacao: '', ativo: true,
            document: '', corporateName: '', description: '',
            averageTicket: '', averagePreparationTime: '', minOrderValue: '',
            merchantCategories: [], acceptedCards: [],
            contactEmails: [], contactPhones: { commercialNumber: '', whatsappNumber: '' },
            address: {
                country: 'BR', state: '', city: '', district: '', street: '',
                number: '', postalCode: '', complement: '', reference: '',
                latitude: '', longitude: '',
            },
            logoImageUrl: '', bannerImageUrl: '', odTtl: 500,
        };
    }
    return {
        name: m.name, merchantId: m.merchantId, appId: m.appId,
        clientSecret: m.clientSecretEnc ? SECRET_MASK : '',
        menugoBaseURL: m.menugoBaseURL, menugoClientId: m.menugoClientId,
        menugoClientSecret: m.menugoClientSecretEnc ? SECRET_MASK : '',
        observacao: m.observacao || '', ativo: m.ativo,
        document: m.document || '', corporateName: m.corporateName || '',
        description: m.description || '',
        averageTicket: m.averageTicket || '',
        averagePreparationTime: m.averagePreparationTime ?? '',
        minOrderValue: m.minOrderValue || '',
        merchantCategories: m.merchantCategories || [],
        acceptedCards: m.acceptedCards || [],
        contactEmails: m.contactEmails || [],
        contactPhones: {
            commercialNumber: m.contactPhones.commercialNumber || '',
            whatsappNumber: m.contactPhones.whatsappNumber || '',
        },
        address: {
            country: m.address.country || 'BR',
            state: m.address.state || '',
            city: m.address.city || '',
            district: m.address.district || '',
            street: m.address.street || '',
            number: m.address.number || '',
            postalCode: m.address.postalCode || '',
            complement: m.address.complement || '',
            reference: m.address.reference || '',
            latitude: m.address.latitude || '',
            longitude: m.address.longitude || '',
        },
        logoImageUrl: m.logoImageUrl || '',
        bannerImageUrl: m.bannerImageUrl || '',
        odTtl: m.odTtl || 500,
    };
}

// ============================================================================
// Tabs
// ============================================================================

function TabCredenciais({ form, set, isEdit }: any) {
    return (
        <>
            <Field label="Nome amigável" hint="Aparece nos cards do KDS.">
                <input required value={form.name} onChange={e => set('name', e.target.value)} className={INPUT_CLS} />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="X-App-MerchantId" hint="≥36 chars. Recomendado: CNPJ-UUID (spec OD).">
                    <input required minLength={36} value={form.merchantId} onChange={e => set('merchantId', e.target.value)}
                        className={`${INPUT_CLS} font-mono text-xs`}
                        placeholder="11111111111111-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" />
                </Field>
                <Field label="X-App-Id" hint="UUID v4 do menuGo.">
                    <input required value={form.appId} onChange={e => set('appId', e.target.value)}
                        className={`${INPUT_CLS} font-mono text-xs`} />
                </Field>
            </div>
            <Field label="clientSecret (HMAC)" hint="Chave que o menuGo usa pra assinar POST /v1/newEvent.">
                <input required={!isEdit} value={form.clientSecret} onChange={e => set('clientSecret', e.target.value)}
                    className={`${INPUT_CLS} font-mono text-xs`}
                    placeholder={isEdit ? `Deixe ${SECRET_MASK} para manter` : ''} />
            </Field>
            <div className="pt-3 border-t border-slate-100 dark:border-white/5">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">Callback OAuth2 → menuGo</h3>
                <div className="space-y-3">
                    <Field label="URL base do menuGo">
                        <input type="url" required value={form.menugoBaseURL} onChange={e => set('menugoBaseURL', e.target.value)}
                            className={INPUT_CLS} placeholder="https://app.menugo.com" />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="OAuth2 client_id">
                            <input required value={form.menugoClientId} onChange={e => set('menugoClientId', e.target.value)}
                                className={`${INPUT_CLS} font-mono text-xs`} />
                        </Field>
                        <Field label="OAuth2 client_secret">
                            <input required={!isEdit} value={form.menugoClientSecret} onChange={e => set('menugoClientSecret', e.target.value)}
                                className={`${INPUT_CLS} font-mono text-xs`}
                                placeholder={isEdit ? `Deixe ${SECRET_MASK} para manter` : ''} />
                        </Field>
                    </div>
                </div>
            </div>
            <Field label="Observação"><textarea rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)} className={INPUT_CLS} /></Field>
            <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="accent-primary" />
                <span className="font-bold">Ativo</span>
            </label>
        </>
    );
}

function TabBasicInfo({ form, set }: any) {
    return (
        <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                Campos do schema <code>BasicInfo</code> da spec OD v1.7 — todos obrigatórios para o <code>GET /v1/merchant</code> conseguir exportar.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="CNPJ (14 dígitos)" hint="document — só números.">
                    <input value={form.document} onChange={e => set('document', e.target.value.replace(/\D/g, ''))}
                        maxLength={14} className={INPUT_CLS} placeholder="22815773000169" />
                </Field>
                <Field label="Razão social" hint="corporateName">
                    <input value={form.corporateName} onChange={e => set('corporateName', e.target.value)} maxLength={500} className={INPUT_CLS} />
                </Field>
            </div>
            <Field label="Descrição" hint="description"><textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} className={INPUT_CLS} /></Field>
            <div className="grid grid-cols-3 gap-4">
                <Field label="Ticket médio" hint="averageTicket (opcional)">
                    <input type="number" step="0.01" value={form.averageTicket} onChange={e => set('averageTicket', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Preparo médio (min)" hint="averagePreparationTime">
                    <input type="number" min={0} value={form.averagePreparationTime} onChange={e => set('averagePreparationTime', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Pedido mínimo (R$)" hint="minOrderValue">
                    <input type="number" step="0.01" min={0} value={form.minOrderValue} onChange={e => set('minOrderValue', e.target.value)} className={INPUT_CLS} />
                </Field>
            </div>
            <Field label="Categorias do merchant *" hint="merchantCategories — selecione 1+ do enum oficial">
                <ChipPicker options={MERCHANT_CATEGORIES as any} value={form.merchantCategories} onChange={v => set('merchantCategories', v)} />
            </Field>
            <Field label="Bandeiras aceitas (opcional)" hint="acceptedCards">
                <ChipPicker options={ACCEPTED_CARDS as any} value={form.acceptedCards} onChange={v => set('acceptedCards', v)} />
            </Field>
            <Field label="TTL OD (segundos)" hint="500..86400 — quanto a OA cacheia o GET /v1/merchant">
                <input type="number" min={500} max={86400} value={form.odTtl} onChange={e => set('odTtl', Number(e.target.value))} className={INPUT_CLS} />
            </Field>
        </>
    );
}

function TabAddress({ form, setAddr }: any) {
    return (
        <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                Schema <code>Address</code> da spec — todos obrigatórios exceto <code>reference</code>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <Field label="País (ISO)" className="md:col-span-1">
                    <input value={form.address.country} onChange={e => setAddr('country', e.target.value.toUpperCase())} maxLength={2} className={INPUT_CLS} />
                </Field>
                <Field label="Estado" className="md:col-span-2">
                    <input value={form.address.state} onChange={e => setAddr('state', e.target.value)} placeholder="BR-SP" className={INPUT_CLS} />
                </Field>
                <Field label="Cidade" className="md:col-span-3">
                    <input value={form.address.city} onChange={e => setAddr('city', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Bairro" className="md:col-span-3">
                    <input value={form.address.district} onChange={e => setAddr('district', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="CEP" className="md:col-span-2">
                    <input value={form.address.postalCode} onChange={e => setAddr('postalCode', e.target.value)} placeholder="01310-000" className={INPUT_CLS} />
                </Field>
                <Field label="Latitude" className="md:col-span-3">
                    <input type="number" step="0.0000001" value={form.address.latitude} onChange={e => setAddr('latitude', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Longitude" className="md:col-span-3">
                    <input type="number" step="0.0000001" value={form.address.longitude} onChange={e => setAddr('longitude', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Rua" className="md:col-span-5">
                    <input value={form.address.street} onChange={e => setAddr('street', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Número" className="md:col-span-1">
                    <input value={form.address.number} onChange={e => setAddr('number', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Complemento" className="md:col-span-3">
                    <input value={form.address.complement} onChange={e => setAddr('complement', e.target.value)} className={INPUT_CLS} />
                </Field>
                <Field label="Referência (opcional)" className="md:col-span-3">
                    <input value={form.address.reference} onChange={e => setAddr('reference', e.target.value)} className={INPUT_CLS} />
                </Field>
            </div>
        </>
    );
}

function TabContact({ form, set, setPhone }: any) {
    const [novoEmail, setNovoEmail] = useState('');
    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Telefone comercial *" hint="contactPhones.commercialNumber">
                    <input value={form.contactPhones.commercialNumber} onChange={e => setPhone('commercialNumber', e.target.value)} className={INPUT_CLS} placeholder="11999999999" />
                </Field>
                <Field label="WhatsApp (opcional)">
                    <input value={form.contactPhones.whatsappNumber} onChange={e => setPhone('whatsappNumber', e.target.value)} className={INPUT_CLS} />
                </Field>
            </div>
            <Field label="E-mails de contato *" hint="contactEmails (≥1)">
                <div className="space-y-1">
                    {form.contactEmails.map((em: string, i: number) => (
                        <div key={i} className="flex gap-2">
                            <input value={em} onChange={e => set('contactEmails', form.contactEmails.map((x: string, j: number) => j === i ? e.target.value : x))} className={INPUT_CLS} />
                            <button type="button" onClick={() => set('contactEmails', form.contactEmails.filter((_: any, j: number) => j !== i))} className="text-red-600 px-2">×</button>
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="novo@email.com" className={INPUT_CLS} />
                        <button type="button" onClick={() => { if (novoEmail.trim()) { set('contactEmails', [...form.contactEmails, novoEmail.trim()]); setNovoEmail(''); } }}
                            className="text-xs font-bold px-3 rounded-lg bg-slate-100 dark:bg-white/5">add</button>
                    </div>
                </div>
            </Field>
        </>
    );
}

function TabImages({ form, set }: any) {
    return (
        <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                Spec exige <strong>HTTPS</strong>, JPEG/PNG/GIF/WEBP, &lt;10MB, dimensões 320–1144px.
            </p>
            <Field label="Logo (URL) *">
                <input type="url" value={form.logoImageUrl} onChange={e => set('logoImageUrl', e.target.value)} className={INPUT_CLS} placeholder="https://..." />
            </Field>
            {form.logoImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoImageUrl} alt="logo" className="w-24 h-24 rounded-lg object-cover border border-slate-200 dark:border-white/10" />
            )}
            <Field label="Banner (URL, opcional)">
                <input type="url" value={form.bannerImageUrl} onChange={e => set('bannerImageUrl', e.target.value)} className={INPUT_CLS} placeholder="https://..." />
            </Field>
            {form.bannerImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.bannerImageUrl} alt="banner" className="w-full max-h-40 rounded-lg object-cover border border-slate-200 dark:border-white/10" />
            )}
        </>
    );
}

// ============================================================================
// Tab Services — CRUD inline
// ============================================================================

function TabServices({ merchantId }: { merchantId: number }) {
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState<{ open: boolean; edit?: ServiceItem }>({ open: false });

    const load = useCallback(async () => {
        setLoading(true);
        const r = await fetch(`/api/merchants/${merchantId}/services`, { cache: 'no-store' });
        if (r.ok) setServices((await r.json()).services || []);
        setLoading(false);
    }, [merchantId]);

    useEffect(() => { load(); }, [load]);

    async function del(s: ServiceItem) {
        if (!confirm(`Remover service ${s.serviceType}?`)) return;
        const r = await fetch(`/api/services/${s.id}`, { method: 'DELETE' });
        if (r.ok) load();
    }

    return (
        <div className="space-y-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Schema <code>Service</code> da spec — necessário ≥1 service no <code>GET /v1/merchant</code>.
                DELIVERY exige <code>serviceArea</code>.
            </p>
            {loading ? (
                <p className="text-sm text-slate-400 text-center py-4">Carregando…</p>
            ) : services.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhum service. Adicione abaixo.</p>
            ) : (
                <ul className="space-y-2">
                    {services.map(s => (
                        <li key={s.id} className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-white/10 rounded-xl p-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-black px-2 py-1 rounded bg-primary/10 text-primary">{s.serviceType}</span>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded ${s.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{s.status}</span>
                                <span className="text-[10px] font-mono opacity-60">{s.uuid}</span>
                                <span className="flex-1" />
                                <button type="button" onClick={() => setShowForm({ open: true, edit: s })} className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-white/5">Editar</button>
                                <button type="button" onClick={() => del(s)} className="text-xs text-red-600 px-2">×</button>
                            </div>
                            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                {s.serviceHours?.weekHours?.length ? `${s.serviceHours.weekHours.length} bloco(s) de horário` : 'sem horários'}
                                {s.serviceArea ? ' · com área' : ''}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <button
                type="button"
                onClick={() => setShowForm({ open: true })}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-primary text-white flex items-center gap-1.5"
            >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Adicionar service
            </button>

            {showForm.open && (
                <ServiceForm
                    merchantId={merchantId}
                    edit={showForm.edit}
                    onClose={() => setShowForm({ open: false })}
                    onSaved={() => { setShowForm({ open: false }); load(); }}
                />
            )}
        </div>
    );
}

function ServiceForm({ merchantId, edit, onClose, onSaved }: {
    merchantId: number;
    edit?: ServiceItem;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [serviceType, setServiceType] = useState(edit?.serviceType || 'INDOOR');
    const [status, setStatus] = useState(edit?.status || 'AVAILABLE');
    const [ativo, setAtivo] = useState(edit?.ativo ?? true);
    const initialHours = edit?.serviceHours?.weekHours ?? [{ dayOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], timePeriods: { startTime: '09:00', endTime: '22:00' } }];
    const [weekHours, setWeekHours] = useState<any[]>(initialHours.map((h: any) => ({
        dayOfWeek: h.dayOfWeek,
        startTime: timeFromOd(h.timePeriods?.startTime || '09:00'),
        endTime: timeFromOd(h.timePeriods?.endTime || '22:00'),
    })));
    const [hasArea, setHasArea] = useState(!!edit?.serviceArea);
    const [areaLat, setAreaLat] = useState(edit?.serviceArea?.geoRadius?.center?.latitude ?? '');
    const [areaLng, setAreaLng] = useState(edit?.serviceArea?.geoRadius?.center?.longitude ?? '');
    const [areaRadius, setAreaRadius] = useState(edit?.serviceArea?.geoRadius?.radius ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaving(true);
        const body: any = {
            serviceType,
            status,
            ativo,
            serviceHours: {
                weekHours: weekHours.map(w => ({
                    dayOfWeek: w.dayOfWeek,
                    timePeriods: { startTime: w.startTime, endTime: w.endTime },
                })),
            },
        };
        if (hasArea) {
            const lat = Number(areaLat), lng = Number(areaLng), r = Number(areaRadius);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r) || r <= 0) {
                setError('Área: lat/long/radius (>0) obrigatórios');
                setSaving(false);
                return;
            }
            body.serviceArea = { geoRadius: { center: { latitude: lat, longitude: lng }, radius: r } };
        } else {
            body.serviceArea = null;
        }
        const url = edit ? `/api/services/${edit.id}` : `/api/merchants/${merchantId}/services`;
        const r = await fetch(url, {
            method: edit ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setSaving(false);
        if (r.ok) onSaved();
        else setError((await r.json()).message || `Erro ${r.status}`);
    }

    function toggleDay(idx: number, day: string) {
        setWeekHours(wh => wh.map((w, i) => i === idx ? {
            ...w,
            dayOfWeek: w.dayOfWeek.includes(day) ? w.dayOfWeek.filter((d: string) => d !== day) : [...w.dayOfWeek, day],
        } : w));
    }

    return (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-start justify-center p-4 pt-12 overflow-y-auto" onClick={onClose}>
            <form onSubmit={submit} onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border p-6 my-4">
                <h3 className="text-lg font-black mb-3">{edit ? 'Editar service' : 'Novo service'}</h3>
                <div className="grid grid-cols-3 gap-3">
                    <Field label="serviceType">
                        <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={INPUT_CLS} disabled={!!edit}>
                            {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </Field>
                    <Field label="status">
                        <select value={status} onChange={e => setStatus(e.target.value)} className={INPUT_CLS}>
                            <option value="AVAILABLE">AVAILABLE</option>
                            <option value="UNAVAILABLE">UNAVAILABLE</option>
                        </select>
                    </Field>
                    <Field label="Ativo no PDV">
                        <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 dark:border-white/10">
                            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-primary" />
                            <span className="text-sm">{ativo ? 'sim' : 'não'}</span>
                        </label>
                    </Field>
                </div>

                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">Horários (weekHours)</h4>
                <div className="space-y-2">
                    {weekHours.map((w, i) => (
                        <div key={i} className="border border-slate-200 dark:border-white/10 rounded-lg p-3 space-y-2">
                            <div className="flex flex-wrap gap-1">
                                {DAYS.map(d => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => toggleDay(i, d)}
                                        className={`text-[10px] font-bold px-2 py-1 rounded ${w.dayOfWeek.includes(d) ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}
                                    >
                                        {d.slice(0, 3)}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="time" value={w.startTime} onChange={e => setWeekHours(wh => wh.map((x, j) => j === i ? { ...x, startTime: e.target.value } : x))} className={INPUT_CLS + ' w-32'} />
                                <span>→</span>
                                <input type="time" value={w.endTime} onChange={e => setWeekHours(wh => wh.map((x, j) => j === i ? { ...x, endTime: e.target.value } : x))} className={INPUT_CLS + ' w-32'} />
                                <button type="button" onClick={() => setWeekHours(wh => wh.filter((_, j) => j !== i))} className="text-red-600 text-sm">×</button>
                            </div>
                        </div>
                    ))}
                    <button type="button" onClick={() => setWeekHours(wh => [...wh, { dayOfWeek: [], startTime: '09:00', endTime: '22:00' }])} className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">
                        + bloco
                    </button>
                </div>

                {serviceType === 'DELIVERY' && (
                    <>
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">Área de entrega (geoRadius)</h4>
                        <label className="flex items-center gap-2 text-sm mb-2">
                            <input type="checkbox" checked={hasArea} onChange={e => setHasArea(e.target.checked)} className="accent-primary" />
                            Definir área de entrega
                        </label>
                        {hasArea && (
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Latitude do centro">
                                    <input type="number" step="0.0000001" value={areaLat} onChange={e => setAreaLat(e.target.value as any)} className={INPUT_CLS} />
                                </Field>
                                <Field label="Longitude do centro">
                                    <input type="number" step="0.0000001" value={areaLng} onChange={e => setAreaLng(e.target.value as any)} className={INPUT_CLS} />
                                </Field>
                                <Field label="Raio (metros)">
                                    <input type="number" min={100} value={areaRadius} onChange={e => setAreaRadius(e.target.value as any)} className={INPUT_CLS} />
                                </Field>
                            </div>
                        )}
                    </>
                )}

                {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{error}</div>}

                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                    <button type="submit" disabled={saving} className="text-sm font-bold px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar'}</button>
                </div>
            </form>
        </div>
    );
}

// Spec usa 'HH:MM:SS.sssZ', input type="time" usa 'HH:MM'. Converte.
function timeFromOd(s: string): string {
    if (!s) return '00:00';
    const m = /^(\d{2}):(\d{2})/.exec(s);
    return m ? `${m[1]}:${m[2]}` : '00:00';
}

// ============================================================================
// Utilities
// ============================================================================

const INPUT_CLS = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm';

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <label className="block text-xs font-bold mb-1">{label}</label>
            {children}
            {hint && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
        </div>
    );
}

function ChipPicker({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
    const [search, setSearch] = useState('');
    const visible = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
    function toggle(o: string) {
        onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o]);
    }
    return (
        <div className="space-y-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="filtrar..." className={INPUT_CLS} />
            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 border border-slate-200 dark:border-white/10 rounded-lg">
                {visible.map(o => (
                    <button
                        key={o}
                        type="button"
                        onClick={() => toggle(o)}
                        className={`text-[10px] font-bold px-2 py-1 rounded ${value.includes(o) ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                    >
                        {o}
                    </button>
                ))}
            </div>
            {value.length > 0 && (
                <div className="text-[10px] text-slate-500">selecionados: {value.join(', ')}</div>
            )}
        </div>
    );
}
