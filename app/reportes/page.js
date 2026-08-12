'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Nav from '@/app/components/Nav';
import { rangoMes, rangoQuincena, etiquetaPeriodo, periodosAnteriores } from '@/lib/periodos';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const formatoCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export default function ReportesPage() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [vista, setVista] = useState('General');

  const hoy = new Date();
  const [año, setAño] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [tipoPeriodo, setTipoPeriodo] = useState('Mensual');
  const [quincena, setQuincena] = useState(hoy.getDate() <= 15 ? 1 : 2);

  const [categorias, setCategorias] = useState([]);
  const [totales, setTotales] = useState({ ingresos: 0, gastos: 0 });
  const [historico, setHistorico] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  const [analisisObjetivos, setAnalisisObjetivos] = useState([]);
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false);

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
  }, [cargandoSesion, vista, año, mes, tipoPeriodo, quincena, proyectos.length]);

  useEffect(() => {
    if (cargandoSesion) return;
    cargarAnalisisObjetivos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length]);

  useEffect(() => {
    if (cargandoSesion) return;

    const canal = supabase
      .channel('reportes-movimientos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => {
        cargarDatos();
        cargarAnalisisObjetivos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objetivos' }, () => {
        cargarAnalisisObjetivos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, año, mes, tipoPeriodo, quincena, proyectos.length]);

  async function totalesPeriodo(rango, pId) {
    let query = supabase
      .from('movimientos')
      .select('tipo, valor, categorias(nombre)')
      .in('tipo', ['Ingreso', 'Gasto'])
      .gte('fecha', rango.inicio)
      .lte('fecha', rango.fin);
    if (pId) query = query.eq('proyecto_id', pId);

    const { data } = await query;
    let ingresos = 0;
    let gastos = 0;
    const porCategoria = {};

    (data || []).forEach((row) => {
      const v = Number(row.valor);
      if (row.tipo === 'Ingreso') ingresos += v;
      if (row.tipo === 'Gasto') {
        gastos += v;
        const nombre = row.categorias?.nombre || 'Sin categoría';
        porCategoria[nombre] = (porCategoria[nombre] || 0) + v;
      }
    });

    return { ingresos, gastos, porCategoria };
  }

  async function cargarDatos() {
    setCargandoDatos(true);

    const rangoActual = tipoPeriodo === 'Mensual' ? rangoMes(año, mes) : rangoQuincena(año, mes, quincena);
    const actual = await totalesPeriodo(rangoActual, proyectoId);

    setTotales({ ingresos: actual.ingresos, gastos: actual.gastos });
    setCategorias(
      Object.entries(actual.porCategoria)
        .map(([nombre, valor]) => ({ nombre, valor }))
        .sort((a, b) => b.valor - a.valor)
    );

    const periodos = periodosAnteriores(año, mes, tipoPeriodo === 'Mensual' ? null : quincena, 6);
    const datosHistorico = [];
    for (const p of periodos) {
      const rango = tipoPeriodo === 'Mensual' ? rangoMes(p.año, p.mes) : rangoQuincena(p.año, p.mes, p.quincena);
      const t = await totalesPeriodo(rango, proyectoId);
      datosHistorico.push({
        periodo: etiquetaPeriodo(p.año, p.mes, p.quincena),
        Ingresos: t.ingresos,
        Gastos: t.gastos,
      });
    }
    setHistorico(datosHistorico);

    setCargandoDatos(false);
  }

  async function cargarAnalisisObjetivos() {
    setCargandoAnalisis(true);

    let query = supabase
      .from('objetivos')
      .select('*, categorias(nombre), subcategorias(nombre)')
      .eq('activo', true);
    if (proyectoId) query = query.eq('proyecto_id', proyectoId);

    const { data } = await query;
    const resultados = [];

    for (const o of data || []) {
      resultados.push(await calcularAnalisisObjetivo(o));
    }

    setAnalisisObjetivos(resultados);
    setCargandoAnalisis(false);
  }

  async function calcularAnalisisObjetivo(o) {
    if (o.tipo === 'Limite_Gasto') {
      const hoyLocal = new Date();
      let rango;
      if (o.periodo === 'Quincenal') {
        const q = hoyLocal.getDate() <= 15 ? 1 : 2;
        rango = rangoQuincena(hoyLocal.getFullYear(), hoyLocal.getMonth() + 1, q);
      } else {
        rango = rangoMes(hoyLocal.getFullYear(), hoyLocal.getMonth() + 1);
      }

      let q2 = supabase
        .from('movimientos')
        .select('valor')
        .eq('tipo', 'Gasto')
        .eq('proyecto_id', o.proyecto_id)
        .eq('categoria_id', o.categoria_id)
        .gte('fecha', rango.inicio)
        .lte('fecha', rango.fin);
      if (o.subcategoria_id) q2 = q2.eq('subcategoria_id', o.subcategoria_id);

      const { data } = await q2;
      const gastado = (data || []).reduce((acc, r) => acc + Number(r.valor), 0);
      const pct = o.monto_objetivo > 0 ? (gastado / o.monto_objetivo) * 100 : 0;
      const cumplido = gastado <= o.monto_objetivo;
      const nombrePeriodo = o.periodo === 'Quincenal' ? 'esta quincena' : 'este mes';

      return {
        ...o,
        pct: Math.min(pct, 999),
        cumplido,
        texto: cumplido
          ? `Vas bien: llevas ${formatoCOP.format(gastado)} de ${formatoCOP.format(
              o.monto_objetivo
            )} (${pct.toFixed(0)}%) en ${nombrePeriodo}.`
          : `Te pasaste por ${formatoCOP.format(gastado - o.monto_objetivo)} (${pct.toFixed(
              0
            )}% del límite) en ${nombrePeriodo}.`,
      };
    }

    if (o.tipo === 'Reduccion_Deuda') {
      let q2 = supabase
        .from('v_saldo_deuda')
        .select('saldo')
        .eq('proyecto_id', o.proyecto_id)
        .eq('categoria', o.categorias?.nombre);
      if (o.subcategorias?.nombre) q2 = q2.eq('subcategoria', o.subcategorias.nombre);

      const { data } = await q2;
      const saldoActual = (data || []).reduce((acc, r) => acc + Number(r.saldo), 0);

      const totalPorReducir = (o.saldo_inicial || 0) - o.monto_objetivo;
      const reducidoHasta = (o.saldo_inicial || 0) - saldoActual;
      const pct = totalPorReducir > 0 ? Math.max(0, Math.min(100, (reducidoHasta / totalPorReducir) * 100)) : 100;

      let proyeccion = '';
      if (o.fecha_limite) {
        const diasTranscurridos = Math.max(
          1,
          (Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        const diasRestantes = (new Date(o.fecha_limite).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        const ritmoDiario = reducidoHasta / diasTranscurridos;
        const proyectadoAFecha = reducidoHasta + ritmoDiario * Math.max(0, diasRestantes);
        proyeccion =
          proyectadoAFecha >= totalPorReducir
            ? ' A este ritmo, llegas a la meta a tiempo.'
            : ' A este ritmo, no vas a llegar antes de la fecha límite.';
      }

      return {
        ...o,
        saldoActual,
        pct,
        texto: `Vas al ${pct.toFixed(0)}% de tu meta. Saldo actual: ${formatoCOP.format(
          saldoActual
        )}, meta: ${formatoCOP.format(o.monto_objetivo)}.${proyeccion}`,
      };
    }

    return o;
  }

  function exportarPDF() {
    const doc = new jsPDF();
    const titulo = `Reporte ${vista} — ${etiquetaPeriodo(año, mes, tipoPeriodo === 'Mensual' ? null : quincena)}`;
    doc.text(titulo, 14, 15);
    doc.text(`Ingresos: ${formatoCOP.format(totales.ingresos)}`, 14, 25);
    doc.text(`Gastos: ${formatoCOP.format(totales.gastos)}`, 14, 32);

    autoTable(doc, {
      startY: 40,
      head: [['Categoría', 'Valor']],
      body: categorias.map((c) => [c.nombre, formatoCOP.format(c.valor)]),
    });

    doc.save(`reporte-${vista}-${año}-${mes}${tipoPeriodo === 'Quincenal' ? '-q' + quincena : ''}.pdf`);
  }

  function exportarExcel() {
    const filas = categorias.map((c) => ({ Categoría: c.nombre, Valor: c.valor }));
    filas.push({ Categoría: 'TOTAL INGRESOS', Valor: totales.ingresos });
    filas.push({ Categoría: 'TOTAL GASTOS', Valor: totales.gastos });

    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
    XLSX.writeFile(libro, `reporte-${vista}-${año}-${mes}${tipoPeriodo === 'Quincenal' ? '-q' + quincena : ''}.xlsx`);
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
      <h1 className="text-xl font-semibold mb-4">Reportes</h1>

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

      {!cargandoAnalisis && analisisObjetivos.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-gray-600 mb-2">Cómo vas con tus objetivos</h2>
          <div className="space-y-2 mb-6">
            {analisisObjetivos.map((o) => (
              <div key={o.id} className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-sm font-medium">{o.nombre}</p>
                <p className="text-xs text-gray-500 mt-1">{o.texto}</p>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${
                      o.tipo === 'Limite_Gasto'
                        ? o.cumplido
                          ? 'bg-green-500'
                          : 'bg-red-500'
                        : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, o.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2 mb-4">
        {['Mensual', 'Quincenal'].map((t) => (
          <button
            key={t}
            onClick={() => setTipoPeriodo(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
              tipoPeriodo === t ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="border rounded-lg px-2 py-2 bg-white text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={año}
          onChange={(e) => setAño(Number(e.target.value))}
          className="border rounded-lg px-2 py-2 text-sm"
        />
        {tipoPeriodo === 'Quincenal' && (
          <select
            value={quincena}
            onChange={(e) => setQuincena(Number(e.target.value))}
            className="border rounded-lg px-2 py-2 bg-white text-sm"
          >
            <option value={1}>1ra quincena</option>
            <option value={2}>2da quincena</option>
          </select>
        )}
      </div>

      {cargandoDatos ? (
        <p className="text-gray-400 text-sm">Cargando datos...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500">Ingresos</p>
              <p className="text-lg font-semibold text-green-600">{formatoCOP.format(totales.ingresos)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-500">Gastos</p>
              <p className="text-lg font-semibold text-red-600">{formatoCOP.format(totales.gastos)}</p>
            </div>
          </div>

          <h2 className="text-sm font-medium text-gray-600 mb-2">Gasto por categoría</h2>
          <div className="bg-white rounded-xl p-3 shadow-sm mb-6 space-y-2">
            {categorias.length === 0 && <p className="text-sm text-gray-400">Sin movimientos en este periodo.</p>}
            {categorias.map((c) => (
              <div key={c.nombre} className="flex justify-between text-sm">
                <span>{c.nombre}</span>
                <span className="font-medium">{formatoCOP.format(c.valor)}</span>
              </div>
            ))}
          </div>

          <h2 className="text-sm font-medium text-gray-600 mb-2">Evolución histórica</h2>
          <div className="bg-white rounded-xl p-3 shadow-sm mb-6" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historico}>
                <XAxis dataKey="periodo" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatoCOP.format(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill="#16a34a" />
                <Bar dataKey="Gastos" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex gap-2">
            <button onClick={exportarPDF} className="flex-1 bg-gray-800 text-white rounded-lg py-2 text-sm font-medium">
              Exportar PDF
            </button>
            <button
              onClick={exportarExcel}
              className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium"
            >
              Exportar Excel
            </button>
          </div>
        </>
      )}

      <Nav />
    </main>
  );
}
