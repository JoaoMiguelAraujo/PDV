import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';
import { calcularSaldoEsperado } from '@/lib/caixa';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    const c = await prisma.caixa.findUnique({
        where: { id },
        include: {
            merchant: { select: { id: true, name: true } },
            movimentos: { orderBy: { id: 'asc' } },
        },
    });
    if (!c) return notFound('caixa não existe');

    const esperado = await calcularSaldoEsperado(id);
    // Agrupa totais por tipo
    const porTipo: Record<string, number> = {};
    for (const m of c.movimentos) {
        porTipo[m.tipo] = (porTipo[m.tipo] || 0) + Number(m.valor);
    }
    return NextResponse.json({ ...c, esperado, totaisPorTipo: porTipo });
});

/**
 * PATCH /api/caixa/{id}
 * Body:
 *  - status: 'FECHADO' + valorContado (obrigatório) + observacao
 *  - observacao
 *  - operadorNome
 */
export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }
    const current = await prisma.caixa.findUnique({ where: { id } });
    if (!current) return notFound('caixa não existe');

    const data: any = {};
    if (body.operadorNome !== undefined) data.operadorNome = body.operadorNome || null;
    if (body.observacao !== undefined) data.observacao = body.observacao || null;

    if (body.status !== undefined) {
        if (body.status !== 'FECHADO') return badRequest('status só aceita FECHADO');
        if (current.status === 'FECHADO') return badRequest('caixa já está FECHADO');
        const valorContado = Number(body.valorContado);
        if (!Number.isFinite(valorContado) || valorContado < 0) return badRequest('valorContado inválido');
        const esperado = await calcularSaldoEsperado(id);
        data.status = 'FECHADO';
        data.fechadoEm = new Date();
        data.valorContado = valorContado;
        data.diferenca = +(valorContado - esperado).toFixed(2);
    }

    await prisma.caixa.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
});
