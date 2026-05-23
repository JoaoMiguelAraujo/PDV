import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import LogsClient from './LogsClient';

export const metadata: Metadata = { title: 'Registros — PDV' };
export const dynamic = 'force-dynamic';

export default function LogsPage() {
    return (
        <>
            <Navbar />
            <LogsClient />
        </>
    );
}
