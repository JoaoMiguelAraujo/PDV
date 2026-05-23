import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import MesasClient from './MesasClient';

export const metadata: Metadata = { title: 'Mesas — PDV' };
export const dynamic = 'force-dynamic';

export default function MesasPage() {
    return (
        <>
            <Navbar />
            <MesasClient />
        </>
    );
}
