import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import CaixaClient from './CaixaClient';

export const metadata: Metadata = { title: 'Caixa — PDV' };
export const dynamic = 'force-dynamic';

export default function CaixaPage() {
    return (
        <>
            <Navbar />
            <CaixaClient />
        </>
    );
}
