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

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

function colorTipo(tipo) {
  switch (tipo) {
    case 'Ingreso':
      return 'text-green-600';
    case 'Capital':
      return 'text-blue-600';
    case 'Gasto':
      return 'text-red-600';
    case 'Deuda':
      return 'text-orange-600';
    default:
      return 'text-gray-500';
  }
}

export default function HistorialPage() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [vista, setVista] = useState('General');

  const [movimientos, setMovimientos] = useState([]);
  const [mapaCuentas, setMapaCuentas] = useState({});
  const [cargando, setCargando] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [formEdit, setFormEdit] = useState({ valor: '', fecha: '', descripcion: '', observaciones: '' });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

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

    supabase
      .from('cuentas')
      .select('id, nombre')
      .then(({ data }) => {
        const mapa = {};
        (data || []).forEach((c) => {
          mapa[c.id] = c.nombre;
        });
        setMapaCuentas(mapa);
      });
  }, [cargandoSesion]);

  const proyectoId = vista === 'General' ? null : proyectos.find((p) => p.nombre === vista)?.id;

  useEffect(() => {
    if (cargandoSesion) return;
    cargarMovimientos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length]);

  useEffect(() => {
    if (cargandoSesion) return;
    const canal = supabase
      .channel('historial-movimientos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => {
        cargarMovimientos();
      })
      .subscribe();
    return () => supabase.removeChannel(canal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length]);

  async function cargarMovimientos() {
    setCargando(true);

    let query = supabase
      .from('movimientos')
      .select(
        'id, tipo, valor, fecha, descripcion, observaciones, origen, created_at, movimiento_vinculado_id, cuenta_id, cuenta_destino_id, categorias(nombre), subcategorias(nombre)'
      )
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (proyectoId) query = query.eq('proyecto_id', proyectoId);

    const { data, error } = await query;
    if (!error) setMovimientos(data || []);
    setCargando(false);
  }

  function esEditable(m) {
    if (m.origen !== 'Manual') return false;
    return Date.now() - new Date(m.created_at).getTime() < SIETE_DIAS_MS;
  }

  function abrirEdicion(m) {
    setEditandoId(m.id);
    setFormEdit({
      valor: m.valor,
      fecha: m.fecha,
      descripcion: m.descripcion || '',
      observaciones: m.observaciones || '',
    });
    setMensaje('');
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setMensaje('');
  }

  async function guardarEdicion(m) {
    setGuardando(true);
    setMensaje('');

    const nuevoValor = parseFloat(formEdit.valor);

    if (Number.isNaN(nuevoValor)) {
      setMensaje('El valor no es válido.');
      setGuardando(false);
      return;
    }

    const { error: errorPrincipal } = await supabase
      .from('movimientos')
      .update({
        valor: nuevoValor,
        fecha: formEdit.fecha,
        descripcion: formEdit.descripcion || null,
        observaciones: formEdit.observaciones || null,
      })
      .eq('id', m.id);

    if (errorPrincipal) {
      setMensaje('Error al guardar: ' + errorPrincipal.message);
      setGuardando(false);
      return;
    }

    // Si este movimiento tiene una pareja automática (Gasto↔Capital o Gasto↔Deuda),
    // la mantenemos en sincronía con el nuevo valor y fecha.
    if (m.movimiento_vinculado_id) {
      const { data: vinculado } = await supabase
        .from('movimientos')
        .select('id, tipo')
        .eq('id', m.movimiento_vinculado_id)
        .single();

      if (vinculado) {
        const valorVinculado = vinculado.tipo === 'Deuda' ? -Math.abs(nuevoValor) : Math.abs(nuevoValor);
        await supabase
          .from('movimientos')
          .update({ valor: valorVinculado, fecha: formEdit.fecha })
          .eq('id', vinculado.id);
      }
    }

    setGuardando(false);
    setEditandoId(null);
    cargarMovimientos();
  }

  if (cargandoSesion) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto pb-24">
      <h1 className="text-xl font-semibold mb-4">Historial</h1>

      <div className="flex gap-2 mb-4">
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
        <div className="space-y-2">
          {movimientos.length === 0 && <p className="text-sm text-gray-400">Sin movimientos.</p>}

          {movimientos.map((m) => (
            <div key={m.id} className="bg-white rounded-xl p-3 shadow-sm">
              {editandoId === m.id ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Valor</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formEdit.valor}
                      onChange={(e) => setFormEdit({ ...formEdit, valor: e.target.value })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={formEdit.fecha}
                      onChange={(e) => setFormEdit({ ...formEdit, fecha: e.target.value })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={formEdit.descripcion}
                      onChange={(e) => setFormEdit({ ...formEdit, descripcion: e.target.value })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Observaciones</label>
                    <textarea
                      value={formEdit.observaciones}
                      onChange={(e) => setFormEdit({ ...formEdit, observaciones: e.target.value })}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm"
                      rows={2}
                    />
                  </div>
                  {mensaje && <p className="text-xs text-red-600">{mensaje}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => guardarEdicion(m)}
                      disabled={guardando}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-sm font-medium disabled:opacity-50"
                    >
                      {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                      onClick={cancelarEdicion}
                      className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-1.5 text-sm font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.categorias?.nombre || 'Transferencia'}
                      {m.subcategorias?.nombre ? ` › ${m.subcategorias.nombre}` : ''}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {m.fecha} · {mapaCuentas[m.cuenta_id]}
                      {m.cuenta_destino_id ? ` → ${mapaCuentas[m.cuenta_destino_id]}` : ''}
                    </p>
                    {m.descripcion && <p className="text-xs text-gray-400 truncate">{m.descripcion}</p>}
                    {m.origen === 'Automático' && (
                      <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                        Automático
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${colorTipo(m.tipo)}`}>{formatoCOP.format(m.valor)}</p>
                    {esEditable(m) && (
                      <button onClick={() => abrirEdicion(m)} className="text-xs text-blue-600 mt-1">
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Nav />
    </main>
  );
}
