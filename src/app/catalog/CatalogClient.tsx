'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * UI de catálogo do PDV — alinhada aos campos da spec OD v1.7 (Item, ItemOffer,
 * Category, OptionGroup, Option). Nada de campos proprietários.
 *
 * Fluxo: operador escolhe um Merchant → vê categorias do merchant → drill-down
 * em categoria mostra produtos; drill-down em produto mostra grupos e opções.
 */

interface MerchantLite { id: number; name: string; merchantId: string }
interface Categoria {
    id: number;
    uuid: string;
    nome: string;
    descricao: string | null;
    ordem: number;
    ativo: boolean;
    merchant: { id: number; name: string };
    _count: { produtos: number };
}
interface Produto {
    id: number;
    uuid: string;
    offerUuid: string;
    nome: string;
    descricao: string | null;
    preco: string;
    sku: string | null;
    codigoExterno: string | null;
    unidade: string;
    fotoUrl: string | null;
    preparoMin: number | null;
    ativo: boolean;
    ordem: number;
    categoriaId: number | null;
    categoria: { id: number; nome: string } | null;
    merchantId: number;
    _count: { grupos: number };
}
interface Grupo {
    id: number;
    uuid: string;
    nome: string;
    min: number;
    max: number;
    obrigatorio: boolean;
    ordem: number;
    opcoes: Opcao[];
}
interface Opcao {
    id: number;
    uuid: string;
    nome: string;
    precoAdicional: string;
    sku: string | null;
    codigoExterno: string | null;
    ativo: boolean;
    ordem: number;
}
interface ProdutoDetalhado extends Produto {
    grupos: Grupo[];
}

const UNIDADES = ['UN', 'KG', 'L', 'OZ', 'LB', 'GAL'] as const;

export default function CatalogClient() {
    const [merchants, setMerchants] = useState<MerchantLite[]>([]);
    const [selectedMerchantId, setSelectedMerchantId] = useState<number | null>(null);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [openProduto, setOpenProduto] = useState<ProdutoDetalhado | null>(null);
    const [openFichaProduto, setOpenFichaProduto] = useState<Produto | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [showCatForm, setShowCatForm] = useState<{ open: boolean; edit?: Categoria }>({ open: false });
    const [showProdForm, setShowProdForm] = useState<{ open: boolean; edit?: Produto }>({ open: false });
    const [filterCat, setFilterCat] = useState<number | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    const loadMerchants = useCallback(async () => {
        const r = await fetch('/api/merchants', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        const list: MerchantLite[] = (d.merchants || []).map((m: any) => ({ id: m.id, name: m.name, merchantId: m.merchantId }));
        setMerchants(list);
        if (list.length && selectedMerchantId == null) setSelectedMerchantId(list[0].id);
    }, [selectedMerchantId]);

    const loadCatalog = useCallback(async () => {
        if (selectedMerchantId == null) return;
        setLoading(true);
        try {
            const [rc, rp] = await Promise.all([
                fetch(`/api/categorias?merchantId=${selectedMerchantId}`, { cache: 'no-store' }),
                fetch(`/api/produtos?merchantId=${selectedMerchantId}&limit=1000`, { cache: 'no-store' }),
            ]);
            if (rc.ok) setCategorias((await rc.json()).categorias || []);
            if (rp.ok) setProdutos((await rp.json()).produtos || []);
        } finally {
            setLoading(false);
        }
    }, [selectedMerchantId]);

    useEffect(() => { loadMerchants(); }, [loadMerchants]);
    useEffect(() => { loadCatalog(); }, [loadCatalog]);

    const produtosFiltrados = useMemo(() => {
        if (filterCat == null) return produtos;
        return produtos.filter(p => p.categoriaId === filterCat);
    }, [produtos, filterCat]);

    async function loadProduto(id: number) {
        const r = await fetch(`/api/produtos/${id}`, { cache: 'no-store' });
        if (!r.ok) { showToast('Falha ao carregar produto'); return; }
        const d = await r.json();
        setOpenProduto(d);
    }

    async function delCategoria(c: Categoria) {
        if (!confirm(`Remover categoria "${c.nome}"? Produtos vinculados ficarão sem categoria.`)) return;
        const r = await fetch(`/api/categorias/${c.id}`, { method: 'DELETE' });
        if (r.ok) { showToast('Categoria removida'); loadCatalog(); }
        else showToast('Falha ao remover');
    }

    async function delProduto(p: Produto) {
        if (!confirm(`Remover produto "${p.nome}"?`)) return;
        const r = await fetch(`/api/produtos/${p.id}`, { method: 'DELETE' });
        if (r.ok) { showToast('Produto removido'); loadCatalog(); }
        else showToast('Falha ao remover');
    }

    async function toggleProdutoAtivo(p: Produto) {
        const r = await fetch(`/api/produtos/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: !p.ativo }),
        });
        if (r.ok) loadCatalog();
    }

    return (
        <div className="min-h-screen">
            <div className="border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 sticky top-[57px] z-10">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
                    <label className="text-xs font-bold flex items-center gap-2">
                        Merchant:
                        <select
                            value={selectedMerchantId ?? ''}
                            onChange={e => setSelectedMerchantId(parseInt(e.target.value, 10))}
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm"
                        >
                            {merchants.length === 0 && <option value="">— Cadastre em Merchants —</option>}
                            {merchants.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </label>
                    <div className="flex-1" />
                    <button
                        onClick={() => setShowCatForm({ open: true })}
                        disabled={selectedMerchantId == null}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-1.5 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Nova categoria
                    </button>
                    <button
                        onClick={() => setShowProdForm({ open: true })}
                        disabled={selectedMerchantId == null}
                        className="text-xs font-bold px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Novo produto
                    </button>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Coluna categorias */}
                <aside className="lg:col-span-3 space-y-2">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Categorias</h2>
                    <button
                        onClick={() => setFilterCat(null)}
                        className={`w-full text-left text-sm px-3 py-2 rounded-lg font-bold ${filterCat == null ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                    >
                        Todas ({produtos.length})
                    </button>
                    {categorias.map(c => (
                        <div key={c.id} className="group flex items-center gap-1">
                            <button
                                onClick={() => setFilterCat(c.id)}
                                className={`flex-1 text-left text-sm px-3 py-2 rounded-lg font-bold flex items-center justify-between ${filterCat === c.id ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10'} ${!c.ativo ? 'opacity-50' : ''}`}
                            >
                                <span className="truncate">{c.nome}</span>
                                <span className="text-[10px] font-mono opacity-70">{c._count.produtos}</span>
                            </button>
                            <button
                                onClick={() => setShowCatForm({ open: true, edit: c })}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-primary"
                                title="Editar"
                            >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            <button
                                onClick={() => delCategoria(c)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600"
                                title="Remover"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    ))}
                    {categorias.length === 0 && !loading && (
                        <p className="text-xs text-slate-400 italic px-3">Nenhuma categoria cadastrada.</p>
                    )}
                </aside>

                {/* Coluna produtos */}
                <section className="lg:col-span-9 space-y-3">
                    {loading ? (
                        <p className="text-center text-slate-400 text-sm py-10">Carregando…</p>
                    ) : produtosFiltrados.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-10">Nenhum produto neste filtro.</p>
                    ) : (
                        <ul className="space-y-2">
                            {produtosFiltrados.map(p => (
                                <li
                                    key={p.id}
                                    className={`flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 ${!p.ativo ? 'opacity-60' : ''}`}
                                >
                                    {p.fotoUrl ? (
                                        <img src={p.fotoUrl} alt="" className="w-12 h-12 rounded object-cover" />
                                    ) : (
                                        <div className="w-12 h-12 rounded bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-slate-400 text-[20px]">restaurant</span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold truncate">{p.nome}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                            {p.categoria?.nome || 'sem categoria'} · SKU {p.sku || '—'} · ext {p.codigoExterno || '—'}
                                            {p._count.grupos > 0 && <span> · {p._count.grupos} grupo(s)</span>}
                                        </div>
                                    </div>
                                    <div className="text-sm font-black tabular-nums">R$ {Number(p.preco).toFixed(2)}</div>
                                    <button
                                        onClick={() => loadProduto(p.id)}
                                        className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-1.5"
                                        title="Editar grupos/opções"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">tune</span>
                                        Opções
                                    </button>
                                    <button
                                        onClick={() => setOpenFichaProduto(p)}
                                        className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-1.5"
                                        title="Ficha técnica"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">science</span>
                                        Ficha
                                    </button>
                                    <button
                                        onClick={() => setShowProdForm({ open: true, edit: p })}
                                        className="p-2 text-slate-400 hover:text-primary"
                                        title="Editar"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">edit</span>
                                    </button>
                                    <button
                                        onClick={() => toggleProdutoAtivo(p)}
                                        className="p-2 text-slate-400 hover:text-amber-600"
                                        title={p.ativo ? 'Desativar' : 'Ativar'}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">{p.ativo ? 'visibility' : 'visibility_off'}</span>
                                    </button>
                                    <button
                                        onClick={() => delProduto(p)}
                                        className="p-2 text-slate-400 hover:text-red-600"
                                        title="Remover"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </main>

            {showCatForm.open && selectedMerchantId != null && (
                <CategoriaForm
                    merchantId={selectedMerchantId}
                    edit={showCatForm.edit}
                    onClose={() => setShowCatForm({ open: false })}
                    onSaved={() => { setShowCatForm({ open: false }); loadCatalog(); }}
                />
            )}

            {showProdForm.open && selectedMerchantId != null && (
                <ProdutoForm
                    merchantId={selectedMerchantId}
                    categorias={categorias}
                    edit={showProdForm.edit}
                    onClose={() => setShowProdForm({ open: false })}
                    onSaved={() => { setShowProdForm({ open: false }); loadCatalog(); }}
                />
            )}

            {openProduto && (
                <ProdutoOpcoesPanel
                    produto={openProduto}
                    onClose={() => setOpenProduto(null)}
                    onChanged={async () => {
                        const r = await fetch(`/api/produtos/${openProduto.id}`, { cache: 'no-store' });
                        if (r.ok) setOpenProduto(await r.json());
                        loadCatalog();
                    }}
                />
            )}

            {openFichaProduto && selectedMerchantId != null && (
                <FichaTecnicaDialog
                    produto={openFichaProduto}
                    merchantId={selectedMerchantId}
                    onClose={() => setOpenFichaProduto(null)}
                    onSaved={() => { setOpenFichaProduto(null); }}
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

// ============================================================================
// Forms
// ============================================================================

function CategoriaForm({ merchantId, edit, onClose, onSaved }: {
    merchantId: number;
    edit?: Categoria;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [nome, setNome] = useState(edit?.nome ?? '');
    const [descricao, setDescricao] = useState(edit?.descricao ?? '');
    const [ordem, setOrdem] = useState(String(edit?.ordem ?? 0));
    const [ativo, setAtivo] = useState(edit?.ativo ?? true);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        const body = { merchantId, nome, descricao, ordem: Number(ordem) || 0, ativo };
        const url = edit ? `/api/categorias/${edit.id}` : '/api/categorias';
        const r = await fetch(url, {
            method: edit ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro ao salvar');
    }

    return (
        <Modal onClose={onClose} title={edit ? 'Editar categoria' : 'Nova categoria'}>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Nome *"><input value={nome} onChange={e => setNome(e.target.value)} required className={inputCls} /></Field>
                <Field label="Descrição"><textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className={inputCls} /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Ordem"><input value={ordem} onChange={e => setOrdem(e.target.value)} type="number" className={inputCls} /></Field>
                    <Field label="Ativo">
                        <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 dark:border-white/10">
                            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-primary" />
                            <span className="text-sm">{ativo ? 'AVAILABLE' : 'UNAVAILABLE'}</span>
                        </label>
                    </Field>
                </div>
                <FormActions onClose={onClose} busy={busy} />
            </form>
        </Modal>
    );
}

function ProdutoForm({ merchantId, categorias, edit, onClose, onSaved }: {
    merchantId: number;
    categorias: Categoria[];
    edit?: Produto;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [nome, setNome] = useState(edit?.nome ?? '');
    const [descricao, setDescricao] = useState(edit?.descricao ?? '');
    const [preco, setPreco] = useState(edit ? String(edit.preco) : '');
    const [sku, setSku] = useState(edit?.sku ?? '');
    const [codigoExterno, setCodigoExterno] = useState(edit?.codigoExterno ?? '');
    const [unidade, setUnidade] = useState(edit?.unidade ?? 'UN');
    const [fotoUrl, setFotoUrl] = useState(edit?.fotoUrl ?? '');
    const [preparoMin, setPreparoMin] = useState(edit?.preparoMin != null ? String(edit.preparoMin) : '');
    const [categoriaId, setCategoriaId] = useState(edit?.categoriaId ? String(edit.categoriaId) : '');
    const [ordem, setOrdem] = useState(String(edit?.ordem ?? 0));
    const [ativo, setAtivo] = useState(edit?.ativo ?? true);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        const body: any = {
            merchantId,
            nome,
            descricao,
            preco: Number(preco),
            sku: sku || null,
            codigoExterno: codigoExterno || null,
            unidade,
            fotoUrl: fotoUrl || null,
            preparoMin: preparoMin === '' ? null : Number(preparoMin),
            categoriaId: categoriaId === '' ? null : Number(categoriaId),
            ordem: Number(ordem) || 0,
            ativo,
        };
        const url = edit ? `/api/produtos/${edit.id}` : '/api/produtos';
        const r = await fetch(url, {
            method: edit ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        setBusy(false);
        if (r.ok) onSaved();
        else alert((await r.json()).message || 'Erro ao salvar');
    }

    return (
        <Modal onClose={onClose} title={edit ? 'Editar produto' : 'Novo produto'} wide>
            <form onSubmit={submit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Nome *" className="col-span-2"><input value={nome} onChange={e => setNome(e.target.value)} required maxLength={200} className={inputCls} /></Field>
                    <Field label="Descrição" className="col-span-2"><textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} className={inputCls} /></Field>
                    <Field label="Preço (BRL) *"><input value={preco} onChange={e => setPreco(e.target.value)} required type="number" step="0.01" min="0" className={inputCls} /></Field>
                    <Field label="Categoria">
                        <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)} className={inputCls}>
                            <option value="">— sem categoria —</option>
                            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                    </Field>
                    <Field label="SKU (interno)"><input value={sku} onChange={e => setSku(e.target.value)} maxLength={80} className={inputCls} /></Field>
                    <Field label="Código externo (OD)"><input value={codigoExterno} onChange={e => setCodigoExterno(e.target.value)} maxLength={100} className={inputCls} /></Field>
                    <Field label="Unidade *">
                        <select value={unidade} onChange={e => setUnidade(e.target.value)} className={inputCls}>
                            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </Field>
                    <Field label="Preparo (min)"><input value={preparoMin} onChange={e => setPreparoMin(e.target.value)} type="number" min="0" className={inputCls} /></Field>
                    <Field label="Foto URL (https)" className="col-span-2"><input value={fotoUrl} onChange={e => setFotoUrl(e.target.value)} type="url" placeholder="https://..." className={inputCls} /></Field>
                    <Field label="Ordem"><input value={ordem} onChange={e => setOrdem(e.target.value)} type="number" className={inputCls} /></Field>
                    <Field label="Status">
                        <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 dark:border-white/10">
                            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="accent-primary" />
                            <span className="text-sm">{ativo ? 'AVAILABLE' : 'UNAVAILABLE'}</span>
                        </label>
                    </Field>
                </div>
                <FormActions onClose={onClose} busy={busy} />
            </form>
        </Modal>
    );
}

function ProdutoOpcoesPanel({ produto, onClose, onChanged }: {
    produto: ProdutoDetalhado;
    onClose: () => void;
    onChanged: () => Promise<void> | void;
}) {
    const [novoGrupo, setNovoGrupo] = useState({ nome: '', min: 0, max: 1 });

    async function addGrupo() {
        if (!novoGrupo.nome.trim()) return;
        const r = await fetch(`/api/produtos/${produto.id}/grupos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoGrupo),
        });
        if (r.ok) { setNovoGrupo({ nome: '', min: 0, max: 1 }); await onChanged(); }
        else alert((await r.json()).message || 'Erro ao adicionar grupo');
    }

    async function delGrupo(g: Grupo) {
        if (!confirm(`Remover grupo "${g.nome}"?`)) return;
        const r = await fetch(`/api/grupos/${g.id}`, { method: 'DELETE' });
        if (r.ok) await onChanged();
    }

    async function addOpcao(g: Grupo, nome: string, precoAdicional: number) {
        const r = await fetch(`/api/grupos/${g.id}/opcoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, precoAdicional }),
        });
        if (r.ok) await onChanged();
        else alert((await r.json()).message || 'Erro');
    }

    async function delOpcao(o: Opcao) {
        if (!confirm(`Remover opção "${o.nome}"?`)) return;
        const r = await fetch(`/api/opcoes/${o.id}`, { method: 'DELETE' });
        if (r.ok) await onChanged();
    }

    return (
        <Modal onClose={onClose} title={`Opções — ${produto.nome}`} wide>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Grupos viram <code>OptionGroup</code>, opções viram <code>Option</code> no <code>GET /v1/merchant</code>.
            </p>

            <div className="space-y-4">
                {produto.grupos.length === 0 && (
                    <p className="text-sm text-slate-400 italic">Sem grupos. Adicione o primeiro abaixo.</p>
                )}
                {produto.grupos.map(g => (
                    <div key={g.id} className="border border-slate-200 dark:border-white/10 rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <strong className="text-sm">{g.nome}</strong>
                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">min {g.min} · max {g.max}</span>
                            <span className="flex-1" />
                            <button onClick={() => delGrupo(g)} className="text-xs text-red-600 hover:underline">remover grupo</button>
                        </div>
                        <ul className="space-y-1 mb-2">
                            {g.opcoes.map(o => (
                                <li key={o.id} className="flex items-center gap-2 text-sm">
                                    <span className="flex-1">{o.nome}</span>
                                    <span className="font-mono text-xs text-slate-500">+ R$ {Number(o.precoAdicional).toFixed(2)}</span>
                                    <button onClick={() => delOpcao(o)} className="text-xs text-slate-400 hover:text-red-600">×</button>
                                </li>
                            ))}
                        </ul>
                        <NovaOpcaoInline onAdd={(nome, preco) => addOpcao(g, nome, preco)} />
                    </div>
                ))}

                <div className="border border-dashed border-slate-200 dark:border-white/10 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Adicionar grupo</div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                            placeholder="Nome (ex.: Tamanho)"
                            value={novoGrupo.nome}
                            onChange={e => setNovoGrupo({ ...novoGrupo, nome: e.target.value })}
                            className={inputCls + ' md:col-span-2'}
                        />
                        <input type="number" min={0} placeholder="min" value={novoGrupo.min} onChange={e => setNovoGrupo({ ...novoGrupo, min: Number(e.target.value) })} className={inputCls} />
                        <input type="number" min={1} placeholder="max" value={novoGrupo.max} onChange={e => setNovoGrupo({ ...novoGrupo, max: Number(e.target.value) })} className={inputCls} />
                    </div>
                    <button onClick={addGrupo} className="mt-2 text-xs font-bold px-3 py-2 rounded-lg bg-primary text-white hover:opacity-90 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        Adicionar grupo
                    </button>
                </div>
            </div>

            <div className="flex justify-end mt-4">
                <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Fechar</button>
            </div>
        </Modal>
    );
}

function NovaOpcaoInline({ onAdd }: { onAdd: (nome: string, preco: number) => Promise<void> | void }) {
    const [nome, setNome] = useState('');
    const [preco, setPreco] = useState('0');
    return (
        <div className="flex gap-2 items-center">
            <input placeholder="Nome da opção" value={nome} onChange={e => setNome(e.target.value)} className={inputCls + ' flex-1'} />
            <input placeholder="+R$" type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} className={inputCls + ' w-24'} />
            <button
                onClick={async () => {
                    if (!nome.trim()) return;
                    await onAdd(nome.trim(), Number(preco) || 0);
                    setNome(''); setPreco('0');
                }}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
            >
                add
            </button>
        </div>
    );
}

// ============================================================================
// Ficha técnica (Onda 4)
// ============================================================================

interface InsumoMin {
    id: number;
    nome: string;
    unidade: string;
    custoMedio: string;
    qtdAtual: string;
}
interface FichaItem {
    id?: number;
    insumoId: number;
    quantidade: number;
    insumo?: InsumoMin;
}

function FichaTecnicaDialog({ produto, merchantId, onClose, onSaved }: {
    produto: Produto;
    merchantId: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoMin[]>([]);
    const [ficha, setFicha] = useState<FichaItem[]>([]);
    const [cmv, setCmv] = useState(0);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const [rIns, rFicha] = await Promise.all([
                fetch(`/api/insumos?merchantId=${merchantId}&ativo=1`, { cache: 'no-store' }),
                fetch(`/api/produtos/${produto.id}/ficha`, { cache: 'no-store' }),
            ]);
            if (rIns.ok) setInsumosCatalogo((await rIns.json()).insumos || []);
            if (rFicha.ok) {
                const d = await rFicha.json();
                setFicha((d.ficha || []).map((f: any) => ({
                    id: f.id,
                    insumoId: f.insumoId,
                    quantidade: Number(f.quantidade),
                    insumo: f.insumo,
                })));
                setCmv(Number(d.cmv));
            }
            setLoading(false);
        })();
    }, [produto.id, merchantId]);

    const visibles = insumosCatalogo.filter(i =>
        !ficha.some(f => f.insumoId === i.id) &&
        (search === '' || i.nome.toLowerCase().includes(search.toLowerCase()))
    );

    function add(i: InsumoMin) {
        setFicha(f => [...f, { insumoId: i.id, quantidade: 1, insumo: i }]);
    }
    function update(idx: number, qty: number) {
        setFicha(f => f.map((x, i) => i === idx ? { ...x, quantidade: qty } : x));
    }
    function remove(idx: number) {
        setFicha(f => f.filter((_, i) => i !== idx));
    }

    async function salvar() {
        setBusy(true);
        const r = await fetch(`/api/produtos/${produto.id}/ficha`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens: ficha.map(f => ({ insumoId: f.insumoId, quantidade: f.quantidade })) }),
        });
        setBusy(false);
        if (r.ok) {
            // Recalcula CMV após salvar
            const r2 = await fetch(`/api/produtos/${produto.id}/ficha`, { cache: 'no-store' });
            if (r2.ok) setCmv(Number((await r2.json()).cmv));
            onSaved();
        } else {
            alert((await r.json()).message || 'Erro');
        }
    }

    const preco = Number(produto.preco);
    const margem = preco > 0 ? +((preco - cmv) / preco * 100).toFixed(1) : 0;
    const cmvNovo = ficha.reduce((s, f) => s + (f.quantidade * Number(f.insumo?.custoMedio || 0)), 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-12 p-4 overflow-y-auto" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border my-4">
                <header className="px-6 py-4 border-b flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-black">Ficha técnica — {produto.nome}</h2>
                        <p className="text-[11px] text-slate-500">Insumos consumidos por 1 unidade vendida</p>
                    </div>
                    <button onClick={onClose}><span className="material-symbols-outlined">close</span></button>
                </header>

                <div className="px-6 py-3 border-b grid grid-cols-3 gap-3 bg-slate-50 dark:bg-white/5">
                    <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Preço de venda</div>
                        <div className="text-lg font-black tabular-nums">R$ {preco.toFixed(2)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">CMV (atual)</div>
                        <div className="text-lg font-black tabular-nums">R$ {cmvNovo.toFixed(4)}</div>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">Margem</div>
                        <div className={`text-lg font-black tabular-nums ${preco > 0 && cmvNovo < preco ? 'text-emerald-600' : 'text-red-600'}`}>
                            {preco > 0 ? (+((preco - cmvNovo) / preco * 100).toFixed(1)) : 0}%
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100 dark:divide-white/5">
                    <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2">Ficha ({ficha.length})</h3>
                        {loading ? (
                            <p className="text-sm text-slate-400 text-center py-4">Carregando…</p>
                        ) : ficha.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">Sem insumos. Adicione ao lado.</p>
                        ) : (
                            ficha.map((f, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-lg px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{f.insumo?.nome}</div>
                                        <div className="text-[10px] text-slate-500">R$ {Number(f.insumo?.custoMedio || 0).toFixed(4)}/{f.insumo?.unidade}</div>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.001"
                                        value={f.quantidade}
                                        onChange={e => update(idx, Number(e.target.value))}
                                        className="w-20 px-2 py-1 rounded border bg-white dark:bg-slate-950 text-sm text-right"
                                    />
                                    <span className="text-[10px] text-slate-400 w-8">{f.insumo?.unidade}</span>
                                    <button onClick={() => remove(idx)} className="text-red-600 text-sm">×</button>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2">Adicionar insumo</h3>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filtrar…"
                            className="w-full px-3 py-2 rounded-lg border bg-slate-50 dark:bg-slate-950 text-sm"
                        />
                        {visibles.length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center py-4">Nenhum insumo livre.</p>
                        ) : (
                            visibles.slice(0, 30).map(i => (
                                <button
                                    key={i.id}
                                    onClick={() => add(i)}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-left"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{i.nome}</div>
                                        <div className="text-[10px] text-slate-500">R$ {Number(i.custoMedio).toFixed(4)}/{i.unidade}</div>
                                    </div>
                                    <span className="material-symbols-outlined text-[16px] text-primary">add</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <footer className="px-6 py-4 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
                    <button onClick={salvar} disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">
                        {busy ? 'Salvando…' : 'Salvar ficha'}
                    </button>
                </footer>
            </div>
        </div>
    );
}

// ============================================================================
// Primitivos UI
// ============================================================================

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm';

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={`block ${className || ''}`}>
            <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</span>
            {children}
        </label>
    );
}

function FormActions({ onClose, busy }: { onClose: () => void; busy: boolean }) {
    return (
        <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5">Cancelar</button>
            <button type="submit" disabled={busy} className="text-sm font-bold px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
    );
}

function Modal({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-20 overflow-y-auto" onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-md'} border border-slate-200 dark:border-white/10`}
            >
                <h2 className="text-lg font-black mb-4">{title}</h2>
                {children}
            </div>
        </div>
    );
}
