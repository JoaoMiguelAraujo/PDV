import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
    if (await isAuthenticated()) {
        redirect('/kds');
    }
    redirect('/login');
}
