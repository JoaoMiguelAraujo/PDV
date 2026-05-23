import 'server-only';

/**
 * NFC-e — STUB. Emissão fiscal de NFC-e Modelo 65 ainda não implementada.
 *
 * Por que isso é um stub:
 * - Cada UF tem regras próprias (URL de transmissão, ambiente prod/homol,
 *   certificado A1 obrigatório, série/numeração persistente, contingência).
 * - Implementação correta exige: assinatura XAdES com certificado A1,
 *   transmissão SOAP/REST à SEFAZ, geração de DANFE-NFCe e fila de
 *   retransmissão para contingência off-line.
 * - Recomendação prática: integrar com gateway fiscal terceirizado
 *   (PlugNotas, NFE.io, Tecnospeed) em vez de reinventar.
 *
 * Para evoluir:
 *   1. Cadastrar credenciais SEFAZ por merchant (certificado A1 cifrado,
 *      ambiente, série, último número emitido).
 *   2. Adicionar tabela NotaFiscal (status PENDENTE/EMITIDA/REJEITADA/
 *      CANCELADA, chave acesso, xml, danfe, errosSefaz).
 *   3. Função `emitirNFCe(comandaId)` → monta XML, assina, transmite,
 *      grava resultado.
 *   4. Trigger automático opcional: ao fechar Comanda, dispara emissão.
 *   5. Botão "Emitir NF" na UI da comanda fechada.
 *
 * Por enquanto: comandas fecham normalmente sem documento fiscal.
 */

export class NFCeNotImplementedError extends Error {
    constructor() {
        super('Emissão de NFC-e ainda não implementada. Plug a um gateway fiscal (PlugNotas/NFE.io/Tecnospeed) ou implemente assinatura A1 + transmissão SEFAZ.');
    }
}

export async function emitirNFCe(_comandaId: number): Promise<never> {
    throw new NFCeNotImplementedError();
}
