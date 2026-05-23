import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import ReportsClient from './ReportsClient';

export const metadata: Metadata = { title: 'Relatórios — PDV' };
export const dynamic = 'force-dynamic';

export default function ReportsPage() {
    return (
        <>
            <Navbar />
            <ReportsClient />
        </>
    );
}
