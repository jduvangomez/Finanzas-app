'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: '/movimiento', label: 'Registrar' },
    { href: '/historial', label: 'Historial' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/reportes', label: 'Reportes' },
  ];

  async function salir() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around items-center py-2 max-w-md mx-auto">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`text-sm px-3 py-2 rounded-lg ${
            pathname === l.href ? 'text-blue-600 font-medium' : 'text-gray-500'
          }`}
        >
          {l.label}
        </Link>
      ))}
      <button onClick={salir} className="text-sm px-3 py-2 text-gray-400">
        Salir
      </button>
    </nav>
  );
}
