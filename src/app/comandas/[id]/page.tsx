import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import ComandaClient from './ComandaClient';

export const metadata: Metadata = { title: 'Comanda — PDV' };
export const dynamic = 'force-dynamic';

export default async function ComandaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <>
            <Navbar />
            <ComandaClient id={parseInt(id, 10)} />
        </>
    );
}
