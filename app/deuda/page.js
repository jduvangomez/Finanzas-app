'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Nav from '@/app/components/Nav';

const formatoCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export default function DeudaPage() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [vista, setVista] = useState('General');

  const [saldoDeuda, setSaldoDeuda] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
      else setCargandoSesion(false);
    });
  }, [router]);

  useEffect(() => {
    if (cargandoSesion) return;
    supabase
      .from('proyectos')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => setProyectos(data || []));
  }, [cargandoSesion]);

  const proyectoId = vista === 'General' ? null : proyectos.find((p) => p.nombre === vista)?.id;

  useEffect(() => {
    if (cargandoSesion) return;
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length]);

  useEffect(() => {
    if (cargandoSesion) return;
    const canal = supabase
      .channel('deuda-movimientos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => {
        cargarDatos();
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length]);

  async function cargarDatos() {
    setCargando(true);

    let qSaldo = supabase.from('v_saldo_deuda').select('*');
    if (proyectoId) qSaldo = qSaldo.eq('proyecto_id', proyectoId);
    const { data: saldo } = await qSaldo;
    setSaldoDeuda(saldo || []);

    let qMov = supabase
      .from('movimientos')
      .select('id, valor, fecha, descripcion, origen, categorias(nombre), subcategorias(nombre)')
      .eq('tipo', 'Deuda')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (proyectoId) qMov = qMov.eq('proyecto_id', proyectoId);
    const { data: movs } = await qMov;
    setMovimientos(movs || []);

    setCargando(false);
  }

  const total = saldoDeuda.reduce((acc, d) => acc + Number(d.saldo), 0);

  if (cargandoSesion) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto pb-24">
      <h1 className="text-xl font-semibold mb-4">Deuda</h1>

      <div className="flex gap-2 mb-6">
        {['General', 'Personal', 'Hogar'].map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
              vista === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : (
        <>
          <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
            <p className="text-xs text-gray-500">Deuda total</p>
            <p className="text-2xl font-semibold text-orange-600">{formatoCOP.format(total)}</p>
          </div>

          <h2 className="text-sm font-medium text-gray-600 mb-2">Por acreedor</h2>
          <div className="bg-white rounded-xl p-3 shadow-sm mb-6 space-y-2">
            {saldoDeuda.length === 0 && <p className="text-sm text-gray-400">Sin deudas registradas.</p>}
            {saldoDeuda.map((d, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>
                  {d.categoria}
                  {d.subcategoria ? ` › ${d.subcategoria}` : ''}
                </span>
                <span className="font-medium text-orange-600">{formatoCOP.format(d.saldo)}</span>
              </div>
            ))}
          </div>

          <h2 className="text-sm font-medium text-gray-600 mb-2">Movimientos recientes</h2>
          <p className="text-xs text-gray-400 mb-2">En rojo, aumentos de deuda. En verde, pagos.</p>
          <div className="space-y-2">
            {movimientos.length === 0 && <p className="text-sm text-gray-400">Sin movimientos.</p>}
            {movimientos.map((m) => (
              <div key={m.id} className="bg-white rounded-xl p-3 shadow-sm flex justify-between items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.categorias?.nombre}
                    {m.subcategorias?.nombre ? ` › ${m.subcategorias.nombre}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">{m.fecha}</p>
                  {m.descripcion && <p className="text-xs text-gray-400 truncate">{m.descripcion}</p>}
                </div>
                <p
                  className={`text-sm font-semibold shrink-0 ${
                    Number(m.valor) < 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatoCOP.format(m.valor)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <Nav />
    </main>
  );
}
