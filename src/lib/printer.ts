import 'server-only';

/**
 * Impressão térmica ESC/POS — STUB. Não implementado.
 *
 * Por que isso é um stub:
 * - Drivers de impressora térmica precisam de uma rota física até a
 *   impressora: USB direto (requer escrever no /dev/usb/lpX, exclusivo
 *   do host), TCP (impressora ethernet com IP fixo), ou impressão pelo
 *   browser via WebUSB/WebSerial (requer driver no client).
 * - Container Docker sem acesso a hardware do host não vê /dev/usb.
 * - Solução típica: cliente leve no host (Electron/Tauri) abre socket
 *   local e recebe jobs de impressão via WebSocket OU usa CUPS no host
 *   com o PDV gerando PDF e mandando pra fila.
 *
 * Para evoluir, escolha um caminho:
 *
 *   Opção A — TCP direto à impressora ethernet:
 *     1. Cadastrar IP+porta por merchant.
 *     2. Função `imprimirComanda(comandaId)` monta payload ESC/POS
 *        (cabeçalho, itens, totais, corte) com a lib `escpos` ou raw bytes.
 *     3. `net.createConnection({ host, port })` → write → end.
 *     4. Trigger automático opcional: ao adicionar item → imprime "fila"
 *        na cozinha; ao fechar comanda → imprime cupom de conferência.
 *
 *   Opção B — Cliente local (Electron) com WebSocket:
 *     1. App Electron rodando no balcão escuta em localhost:PORT.
 *     2. PDV faz POST http://localhost:PORT/print com o job.
 *     3. App imprime via driver do sistema operacional.
 *
 *   Opção C — Browser do operador imprime (mais simples):
 *     1. PDV gera HTML formatado para 80mm.
 *     2. `window.print()` com @page CSS específico de cupom.
 *     3. Operador configura impressora padrão como padrão do browser.
 *     Limitação: pop-up de diálogo de impressão a cada job.
 */

export class PrinterNotImplementedError extends Error {
    constructor() {
        super('Impressão térmica não implementada. Veja src/lib/printer.ts para as opções de integração (TCP direto, cliente Electron, ou browser print).');
    }
}

export async function imprimirComanda(_comandaId: number): Promise<never> {
    throw new PrinterNotImplementedError();
}

export async function imprimirCupomFechamento(_comandaId: number): Promise<never> {
    throw new PrinterNotImplementedError();
}
