'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/movimiento');
      } else {
        router.replace('/login');
      }
    });
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </main>
  );
}
