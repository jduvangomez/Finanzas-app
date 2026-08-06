'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { TIPOS_POR_PROYECTO } from '@/lib/tiposPorProyecto';
import Nav from '@/app/components/Nav';

export default function MovimientoPage() {
  const router = useRouter();

  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [cuentas, setCuentas] = useState([]);

  const [proyectoId, setProyectoId] = useState('');
  const [tipo, setTipo] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategorias, setSubcategorias] = useState([]);
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [etiquetas, setEtiquetas] = useState([]);
  const [etiquetaId, setEtiquetaId] = useState('');

  const [cuentaId, setCuentaId] = useState('');
  const [cuentaDestinoId, setCuentaDestinoId] = useState('');
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
      } else {
        setCargandoSesion(false);
      }
    });
  }, [router]);

  useEffect(() => {
    if (cargandoSesion) return;

    supabase
      .from('proyectos')
      .select('id, nombre, color')
      .order('nombre')
      .then(({ data }) => {
        setProyectos(data || []);
        const ultimo = localStorage.getItem('ultimoProyectoId');
        if (data && data.length) {
          const existe = data.find((p) => p.id === ultimo);
          setProyectoId(existe ? ultimo : data[0].id);
        }
      });

    supabase
      .from('cuentas')
      .select('id, nombre, tipo')
      .eq('estado', 'Activa')
      .order('nombre')
      .then(({ data }) => setCuentas(data || []));
  }, [cargandoSesion]);

  const proyectoActual = proyectos.find((p) => p.id === proyectoId);
  const tiposDisponibles = proyectoActual ? TIPOS_POR_PROYECTO[proyectoActual.nombre] || [] : [];

  useEffect(() => {
    if (!proyectoId) return;
    localStorage.setItem('ultimoProyectoId', proyectoId);
    setTipo('');
    setCategoriaId('');
    setSubcategoriaId('');
    setEtiquetaId('');
  }, [proyectoId]);

  useEffect(() => {
    setCategoriaId('');
    setSubcategoriaId('');
    setEtiquetaId('');
    setCategorias([]);

    if (!proyectoId || !tipo || tipo === 'Transferencia') return;

    supabase
      .from('categorias')
      .select('id, nombre')
      .eq('proyecto_id', proyectoId)
      .eq('tipo', tipo)
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setCategorias(data || []));
  }, [proyectoId, tipo]);

  useEffect(() => {
    setSubcategoriaId('');
    setEtiquetaId('');
    setSubcategorias([]);

    if (!categoriaId) return;

    supabase
      .from('subcategorias')
      .select('id, nombre')
      .eq('categoria_id', categoriaId)
      .order('nombre')
      .then(({ data }) => setSubcategorias(data || []));
  }, [categoriaId]);

  useEffect(() => {
    setEtiquetaId('');
    setEtiquetas([]);

    if (!subcategoriaId) return;

    supabase
      .from('etiquetas')
      .select('id, nombre')
      .eq('subcategoria_id', subcategoriaId)
      .order('nombre')
      .then(({ data }) => setEtiquetas(data || []));
  }, [subcategoriaId]);

  function limpiarFormularioParaSiguiente() {
    setCategoriaId('');
    setSubcategoriaId('');
    setEtiquetaId('');
    setCuentaDestinoId('');
    setValor('');
    setDescripcion('');
    setObservaciones('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensaje('');

    if (!proyectoId || !tipo || !cuentaId || !valor || !fecha) {
      setMensaje('Faltan campos obligatorios.');
      return;
    }
    if (tipo === 'Transferencia' && (!cuentaDestinoId || cuentaDestinoId === cuentaId)) {
      setMensaje('Elige una cuenta destino distinta a la de origen.');
      return;
    }
    if (tipo !== 'Transferencia' && !categoriaId) {
      setMensaje('Elige una categoría.');
      return;
    }

    setGuardando(true);

    const { error } = await supabase.from('movimientos').insert({
      proyecto_id: proyectoId,
      tipo,
      categoria_id: tipo === 'Transferencia' ? null : categoriaId,
      subcategoria_id: tipo === 'Transferencia' ? null : subcategoriaId || null,
      etiqueta_id: tipo === 'Transferencia' ? null : etiquetaId || null,
      cuenta_id: cuentaId,
      cuenta_destino_id: tipo === 'Transferencia' ? cuentaDestinoId : null,
      valor: parseFloat(valor),
      fecha,
      descripcion: descripcion || null,
      observaciones: observaciones || null,
      origen: 'Manual',
    });

    setGuardando(false);

    if (error) {
      setMensaje('Error al guardar: ' + error.message);
      return;
    }

    setMensaje('Movimiento guardado.');
    limpiarFormularioParaSiguiente();
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
      <h1 className="text-xl font-semibold mb-4">Registrar movimiento</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Proyecto</label>
          <div className="flex gap-2">
            {proyectos.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setProyectoId(p.id)}
                className={`flex-1 rounded-lg py-2 font-medium border ${
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

        {proyectoId && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white"
              required
            >
              <option value="">Selecciona...</option>
              {tiposDisponibles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}

        {tipo && tipo !== 'Transferencia' && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Categoría</label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white"
                required
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
                <label className="block text-sm text-gray-600 mb-1">Subcategoría</label>
                <select
                  value={subcategoriaId}
                  onChange={(e) => setSubcategoriaId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Selecciona...</option>
                  {subcategorias.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {etiquetas.length > 0 && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">Etiqueta</label>
                <select
                  value={etiquetaId}
                  onChange={(e) => setEtiquetaId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">Selecciona...</option>
                  {etiquetas.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {tipo && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {tipo === 'Transferencia' ? 'Cuenta origen' : 'Cuenta'}
            </label>
            <select
              value={cuentaId}
              onChange={(e) => setCuentaId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white"
              required
            >
              <option value="">Selecciona...</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {tipo === 'Transferencia' && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">Cuenta destino</label>
            <select
              value={cuentaDestinoId}
              onChange={(e) => setCuentaDestinoId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white"
              required
            >
              <option value="">Selecciona...</option>
              {cuentas
                .filter((c) => c.id !== cuentaId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
            </select>
          </div>
        )}

        {tipo && (
          <>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Valor</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Descripción</label>
              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Observaciones</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                rows={2}
              />
            </div>
          </>
        )}

        {mensaje && (
          <p
            className={`text-sm ${
              mensaje.startsWith('Error') || mensaje.startsWith('Faltan') || mensaje.startsWith('Elige')
                ? 'text-red-600'
                : 'text-green-600'
            }`}
          >
            {mensaje}
          </p>
        )}

        {tipo && (
          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar movimiento'}
          </button>
        )}
      </form>

      <Nav />
    </main>
  );
}
