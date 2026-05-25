import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/atendimento/sessoes
 *
 * Lista sessões de mesa abertas (orders agrupadas pela mesa) pra alimentar
 * a tela /atendimento. Filtra apenas:
 *  - orders cujo merchant.adapterType = 'menugo' (a tela é específica desse
 *    adapter — as extensões setWaiter/setOrderPad/closeSale só existem nele).
 *  - orders ainda "vivas": NEW, CONFIRMED ou PREPARING (DELIVERED/CANCELLED
 *    saem da lista).
 *
 * Resposta: { sessoes: SessaoMesa[] }
 */
export const GET = withAuth(async () => {
    const orders = await prisma.order.findMany({
        where: {
            status: { in: ['NEW', 'CONFIRMED', 'PREPARING'] },
            mesa: { not: null },
            merchant: { adapterType: 'menugo' },
        },
        include: { merchant: { select: { id: true, name: true, adapterType: true } } },
        orderBy: { recebidoEm: 'asc' },
    });

    // Agrupa por (merchantId, mesa). Dentro de cada grupo, derivamos o estado
    // "atual" da mesa a partir do order mais recente (waiter, orderPad,
    // closeSaleRequested) — os setters do menuGo são por mesa/sessão, então
    // o último valor é o vigente.
    const grupos = new Map<string, {
        mesa: string;
        merchantId: number;
        merchantName: string;
        waiterId: number | null;
        waiterName: string | null;
        orderPad: string | null;
        closeSaleRequested: boolean;
        orders: any[];
        total: number;
    }>();

    for (const o of orders) {
        const key = `${o.merchantId}::${o.mesa}`;
        let grupo = grupos.get(key);
        if (!grupo) {
            grupo = {
                mesa: String(o.mesa),
                merchantId: o.merchantId,
                merchantName: o.merchant.name,
                waiterId: o.waiterId,
                waiterName: o.waiterName,
                orderPad: o.orderPad,
                closeSaleRequested: o.closeSaleRequested,
                orders: [],
                total: 0,
            };
            grupos.set(key, grupo);
        } else {
            // Estado vigente = order mais recente com flag ligada / valor preenchido.
            if (o.waiterId !== null) {
                grupo.waiterId = o.waiterId;
                grupo.waiterName = o.waiterName;
            }
            if (o.orderPad) grupo.orderPad = o.orderPad;
            if (o.closeSaleRequested) grupo.closeSaleRequested = true;
        }
        grupo.orders.push({
            id: o.id,
            orderId: o.orderId,
            displayId: o.displayId,
            status: o.status,
            mesa: o.mesa,
            cliente: o.cliente,
            totalValor: o.totalValor?.toString() ?? null,
            waiterId: o.waiterId,
            waiterName: o.waiterName,
            orderPad: o.orderPad,
            closeSaleRequested: o.closeSaleRequested,
            closeSaleRequestedAt: o.closeSaleRequestedAt?.toISOString() ?? null,
            recebidoEm: o.recebidoEm.toISOString(),
            merchantId: o.merchantId,
            merchantName: o.merchant.name,
            merchantAdapterType: o.merchant.adapterType,
        });
        grupo.total += Number(o.totalValor || 0);
    }

    const sessoes = Array.from(grupos.values()).sort((a, b) => {
        // numérico quando ambos forem numéricos, alfabético caso contrário.
        const an = Number(a.mesa);
        const bn = Number(b.mesa);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return a.mesa.localeCompare(b.mesa);
    });

    return NextResponse.json({ sessoes });
});
