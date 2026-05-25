import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import AtendimentoClient from './AtendimentoClient';

export const metadata: Metadata = { title: 'Atendimento — PDV' };
export const dynamic = 'force-dynamic';

/**
 * /atendimento — tela operacional do salão.
 *
 * Lista as sessões abertas agrupadas por mesa, com ações para:
 *  - Vincular um garçom à mesa (live_mesas.garcom_id no menuGo)
 *  - Atribuir o número da comanda física do cliente (libera envios segurados
 *    em modo `mesa_com_comanda`)
 *  - Solicitar fechamento da mesa (block envios subsequentes)
 *  - Excluir pedidos locais (homologação/teste — NÃO emite cancel ao menuGo)
 *
 * Disponível apenas para merchants com `adapterType='menugo'`.
 */
export default function AtendimentoPage() {
    return (
        <>
            <Navbar />
            <AtendimentoClient />
        </>
    );
}
