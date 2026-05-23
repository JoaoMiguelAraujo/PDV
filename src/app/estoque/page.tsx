import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import EstoqueClient from './EstoqueClient';

export const metadata: Metadata = { title: 'Estoque — PDV' };
export const dynamic = 'force-dynamic';

export default function EstoquePage() {
    return (
        <>
            <Navbar />
            <EstoqueClient />
        </>
    );
}
