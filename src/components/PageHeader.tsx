import type { ReactNode } from 'react';

/**
 * Cabeçalho padronizado de página: título com peso de display, subtítulo,
 * ações no canto direito. Aplica fade-in para entrada suave.
 *
 * Usar:
 *   <PageHeader title="Mesas" subtitle="Controle de salão e comandas">
 *     <button>Ação</button>
 *   </PageHeader>
 */
export function PageHeader({
    title, subtitle, icon, children,
}: {
    title: string;
    subtitle?: string;
    icon?: string;
    children?: ReactNode;
}) {
    return (
        <header className="pt-6 pb-5 mb-6 border-b border-slate-200/60 dark:border-white/[0.06] animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                    {icon && (
                        <div className="hidden sm:flex w-12 h-12 rounded-xl bg-primary/10 items-center justify-center text-primary border border-primary/20">
                            <span className="material-symbols-outlined">{icon}</span>
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>
                {children && (
                    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        {children}
                    </div>
                )}
            </div>
        </header>
    );
}

/**
 * Container padrão de página — substitui o `max-w-7xl mx-auto px-4 py-6`
 * espalhado, com padding e largura coerentes.
 */
export function PageContainer({ children, wide }: { children: ReactNode; wide?: boolean }) {
    return (
        <main className={`mx-auto px-4 sm:px-6 lg:px-8 pb-12 ${wide ? 'max-w-[1600px]' : 'max-w-7xl'}`}>
            {children}
        </main>
    );
}
