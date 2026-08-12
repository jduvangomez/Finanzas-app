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

export default function ObjetivosPage() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [cargando, setCargando] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [proyectoId, setProyectoId] = useState('');
  const [tipo, setTipo] = useState('Limite_Gasto');
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategorias, setSubcategorias] = useState([]);
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [nombre, setNombre] = useState('');
  const [montoObjetivo, setMontoObjetivo] = useState('');
  const [periodo, setPeriodo] = useState('Mensual');
  const [fechaLimite, setFechaLimite] = useState('');
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
      .then(({ data }) => {
        setProyectos(data || []);
        if (data && data.length) setProyectoId(data[0].id);
      });
  }, [cargandoSesion]);

  useEffect(() => {
    if (cargandoSesion) return;
    cargarObjetivos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion]);

  useEffect(() => {
    if (cargandoSesion) return;
    const canal = supabase
      .channel('objetivos-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objetivos' }, () => cargarObjetivos())
      .subscribe();
    return () => supabase.removeChannel(canal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion]);

  async function cargarObjetivos() {
    setCargando(true);
    const { data } = await supabase
      .from('objetivos')
      .select('*, proyectos(nombre), categorias(nombre), subcategorias(nombre)')
      .eq('activo', true)
      .order('created_at', { ascending: false });
    setObjetivos(data || []);
    setCargando(false);
  }

  useEffect(() => {
    setCategoriaId('');
    setSubcategoriaId('');
    setCategorias([]);
    if (!proyectoId) return;

    const tipoMovimiento = tipo === 'Limite_Gasto' ? 'Gasto' : 'Deuda';

    supabase
      .from('categorias')
      .select('id, nombre')
      .eq('proyecto_id', proyectoId)
      .eq('tipo', tipoMovimiento)
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setCategorias(data || []));
  }, [proyectoId, tipo]);

  useEffect(() => {
    setSubcategoriaId('');
    setSubcategorias([]);
    if (!categoriaId) return;

    supabase
      .from('subcategorias')
      .select('id, nombre')
      .eq('categoria_id', categoriaId)
      .order('nombre')
      .then(({ data }) => setSubcategorias(data || []));
  }, [categoriaId]);

  function abrirFormulario() {
    setMostrarForm(true);
    setMensaje('');
    setNombre('');
    setMontoObjetivo('');
    setFechaLimite('');
    setTipo('Limite_Gasto');
    setPeriodo('Mensual');
  }

  async function guardarObjetivo(e) {
    e.preventDefault();
    setMensaje('');

    if (!proyectoId || !categoriaId || !nombre || !montoObjetivo) {
      setMensaje('Faltan campos obligatorios.');
      return;
    }

    setGuardando(true);

    let saldoInicial = null;

    if (tipo === 'Reduccion_Deuda') {
      const nombreCategoria = categorias.find((c) => c.id === categoriaId)?.nombre;
      let q = supabase.from('v_saldo_deuda').select('saldo').eq('proyecto_id', proyectoId).eq('categoria', nombreCategoria);
      if (subcategoriaId) {
        const nombreSub = subcategorias.find((s) => s.id === subcategoriaId)?.nombre;
        q = q.eq('subcategoria', nombreSub);
      }
      const { data: saldoData } = await q;
      saldoInicial = (saldoData || []).reduce((acc, r) => acc + Number(r.saldo), 0);
    }

    const { error } = await supabase.from('objetivos').insert({
      proyecto_id: proyectoId,
      tipo,
      nombre,
      categoria_id: categoriaId,
      subcategoria_id: subcategoriaId || null,
      monto_objetivo: parseFloat(montoObjetivo),
      saldo_inicial: saldoInicial,
      periodo: tipo === 'Limite_Gasto' ? periodo : null,
      fecha_limite: fechaLimite || null,
    });

    setGuardando(false);

    if (error) {
      setMensaje('Error al guardar: ' + error.message);
      return;
    }

    setMostrarForm(false);
    cargarObjetivos();
  }

  async function desactivarObjetivo(id) {
    await supabase.from('objetivos').update({ activo: false }).eq('id', id);
    cargarObjetivos();
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
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Objetivos</h1>
        {!mostrarForm && (
          <button onClick={abrirFormulario} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5">
            + Nuevo
          </button>
        )}
      </div>

      {mostrarForm && (
        <form onSubmit={guardarObjetivo} className="bg-white rounded-xl p-3 shadow-sm mb-6 space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Proyecto</label>
            <div className="flex gap-2">
              {proyectos.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setProyectoId(p.id)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                    proyectoId === p.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Tipo de objetivo</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo('Limite_Gasto')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                  tipo === 'Limite_Gasto'
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Límite de gasto
              </button>
              <button
                type="button"
                onClick={() => setTipo('Reduccion_Deuda')}
                className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                  tipo === 'Reduccion_Deuda'
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
              >
                Reducir deuda
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Nombre del objetivo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={tipo === 'Limite_Gasto' ? 'Ej. Límite Mercado' : 'Ej. Pagar tarjeta Rappi'}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {tipo === 'Limite_Gasto' ? 'Categoría de gasto' : 'Categoría de deuda'}
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
            >
              <option value="">Selecciona...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {subcategorias.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Subcategoría (opcional)</label>
              <select
                value={subcategoriaId}
                onChange={(e) => setSubcategoriaId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white text-sm"
              >
                <option value="">Toda la categoría</option>
                {subcategorias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tipo === 'Limite_Gasto' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Periodo</label>
              <div className="flex gap-2">
                {['Quincenal', 'Mensual'].map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                      periodo === p ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {tipo === 'Limite_Gasto' ? 'Monto límite' : 'Saldo meta (ej. 0 para pagarla completa)'}
            </label>
            <input
              type="number"
              step="0.01"
              value={montoObjetivo}
              onChange={(e) => setMontoObjetivo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {tipo === 'Reduccion_Deuda' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha límite (opcional)</label>
              <input
                type="date"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          {mensaje && <p className="text-xs text-red-600">{mensaje}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar objetivo'}
            </button>
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {objetivos.length === 0 && <p className="text-sm text-gray-400">Sin objetivos activos.</p>}
          {objetivos.map((o) => (
            <div key={o.id} className="bg-white rounded-xl p-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">{o.nombre}</p>
                  <p className="text-xs text-gray-500">
                    {o.proyectos?.nombre} · {o.categorias?.nombre}
                    {o.subcategorias?.nombre ? ` › ${o.subcategorias.nombre}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {o.tipo === 'Limite_Gasto'
                      ? `Límite ${o.periodo}: ${formatoCOP.format(o.monto_objetivo)}`
                      : `Meta: ${formatoCOP.format(o.monto_objetivo)}${
                          o.fecha_limite ? ` antes de ${o.fecha_limite}` : ''
                        }`}
                  </p>
                </div>
                <button onClick={() => desactivarObjetivo(o.id)} className="text-xs text-gray-400">
                  Desactivar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Nav />
    </main>
  );
}
