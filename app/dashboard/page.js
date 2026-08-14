'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import Nav from '@/app/components/Nav';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { rangoMes, rangoTrimestre, rangoSemestre, rangoAnio } from '@/lib/periodos';

const formatoCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export default function DashboardPage() {
  const router = useRouter();
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [proyectos, setProyectos] = useState([]);
  const [vista, setVista] = useState('General');

  const [saldoCuentas, setSaldoCuentas] = useState([]);
  const [saldoCapital, setSaldoCapital] = useState([]);
  const [saldoDeuda, setSaldoDeuda] = useState([]);
  const [presupuesto, setPresupuesto] = useState([]);
  const [gastoPorCategoria, setGastoPorCategoria] = useState([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [año, setAño] = useState(hoy.getFullYear());
  const [tipoPeriodo, setTipoPeriodo] = useState('Mensual');
  const [trimestre, setTrimestre] = useState(Math.floor(hoy.getMonth() / 3) + 1);
  const [semestre, setSemestre] = useState(hoy.getMonth() < 6 ? 1 : 2);

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
      .select('id, nombre, color')
      .order('nombre')
      .then(({ data }) => setProyectos(data || []));
  }, [cargandoSesion]);

  const proyectoId = vista === 'General' ? null : proyectos.find((p) => p.nombre === vista)?.id;

  useEffect(() => {
    if (cargandoSesion) return;
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length, mes, año, tipoPeriodo, trimestre, semestre]);

  useEffect(() => {
    if (cargandoSesion) return;

    const canal = supabase
      .channel('dashboard-movimientos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => {
        cargarDatos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargandoSesion, vista, proyectos.length, mes, año, tipoPeriodo, trimestre, semestre]);

  async function cargarDatos() {
    setCargandoDatos(true);

    const { data: cuentas } = await supabase.from('v_saldo_cuentas').select('*').order('nombre');
    setSaldoCuentas(cuentas || []);

    let qCapital = supabase.from('v_saldo_capital').select('*');
    if (proyectoId) qCapital = qCapital.eq('proyecto_id', proyectoId);
    const { data: capital } = await qCapital;
    setSaldoCapital(capital || []);

    let qDeuda = supabase.from('v_saldo_deuda').select('*');
    if (proyectoId) qDeuda = qDeuda.eq('proyecto_id', proyectoId);
    const { data: deuda } = await qDeuda;
    setSaldoDeuda(deuda || []);

    const rango =
      tipoPeriodo === 'Mensual'
        ? rangoMes(año, mes)
        : tipoPeriodo === 'Trimestral'
        ? rangoTrimestre(año, trimestre)
        : tipoPeriodo === 'Semestral'
        ? rangoSemestre(año, semestre)
        : tipoPeriodo === 'Anual'
        ? rangoAnio(año)
        : null; // General: sin filtro de fecha

    // Presupuesto: solo tiene sentido comparar contra un mes (el presupuesto se define mensual).
    // En Trimestral/Semestral/Anual/General no se muestra, para no comparar cifras que no son compatibles.
    if (tipoPeriodo === 'Mensual') {
      let qCategoriasPresupuesto = supabase
        .from('categorias')
        .select('id, proyecto_id, nombre, presupuesto')
        .not('presupuesto', 'is', null);
      if (proyectoId) qCategoriasPresupuesto = qCategoriasPresupuesto.eq('proyecto_id', proyectoId);
      const { data: categoriasPresupuesto } = await qCategoriasPresupuesto;

      let qGastoPresupuesto = supabase
        .from('movimientos')
        .select('valor, categoria_id')
        .eq('tipo', 'Gasto')
        .gte('fecha', rango.inicio)
        .lte('fecha', rango.fin);
      if (proyectoId) qGastoPresupuesto = qGastoPresupuesto.eq('proyecto_id', proyectoId);
      const { data: gastoPresupuesto } = await qGastoPresupuesto;

      const gastadoPorCategoria = {};
      (gastoPresupuesto || []).forEach((row) => {
        gastadoPorCategoria[row.categoria_id] = (gastadoPorCategoria[row.categoria_id] || 0) + Number(row.valor);
      });

      setPresupuesto(
        (categoriasPresupuesto || []).map((c) => ({
          categoria_id: c.id,
          nombre: c.nombre,
          presupuesto: Number(c.presupuesto),
          gastado: gastadoPorCategoria[c.id] || 0,
        }))
      );
    } else {
      setPresupuesto([]);
    }

    let qGasto = supabase.from('movimientos').select('valor, categorias(nombre)').eq('tipo', 'Gasto');
    if (rango) qGasto = qGasto.gte('fecha', rango.inicio).lte('fecha', rango.fin);
    if (proyectoId) qGasto = qGasto.eq('proyecto_id', proyectoId);
    const { data: gastos } = await qGasto;

    const agrupado = {};
    (gastos || []).forEach((row) => {
      const nombre = row.categorias?.nombre || 'Sin categoría';
      agrupado[nombre] = (agrupado[nombre] || 0) + Number(row.valor);
    });
    setGastoPorCategoria(
      Object.entries(agrupado)
        .map(([nombre, valor]) => ({ nombre, valor }))
        .sort((a, b) => b.valor - a.valor)
    );

    setCargandoDatos(false);
  }

  const totalCapital = saldoCapital.reduce((acc, c) => acc + Number(c.saldo), 0);
  const totalDeuda = saldoDeuda.reduce((acc, d) => acc + Number(d.saldo), 0);

  if (cargandoSesion) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto pb-24">
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

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

      <div className="flex gap-2 mb-2">
        <select
          value={tipoPeriodo}
          onChange={(e) => setTipoPeriodo(e.target.value)}
          className="flex-1 border rounded-lg px-2 py-2 bg-white text-sm"
        >
          <option value="Mensual">Mensual</option>
          <option value="Trimestral">Trimestral</option>
          <option value="Semestral">Semestral</option>
          <option value="Anual">Anual</option>
          <option value="General">General (todo)</option>
        </select>
        {tipoPeriodo !== 'General' && (
          <input
            type="number"
            value={año}
            onChange={(e) => setAño(Number(e.target.value))}
            className="border rounded-lg px-2 py-2 text-sm w-24"
          />
        )}
      </div>

      {tipoPeriodo === 'Mensual' && (
        <div className="flex gap-2 mb-6">
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="flex-1 border rounded-lg px-2 py-2 bg-white text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setMes(hoy.getMonth() + 1);
              setAño(hoy.getFullYear());
            }}
            className="text-xs text-blue-600 px-2"
          >
            Hoy
          </button>
        </div>
      )}

      {tipoPeriodo === 'Trimestral' && (
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map((t) => (
            <button
              key={t}
              onClick={() => setTrimestre(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                trimestre === t ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              T{t}
            </button>
          ))}
        </div>
      )}

      {tipoPeriodo === 'Semestral' && (
        <div className="flex gap-2 mb-6">
          {[1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSemestre(s)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${
                semestre === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              Semestre {s}
            </button>
          ))}
        </div>
      )}

      {(tipoPeriodo === 'Anual' || tipoPeriodo === 'General') && <div className="mb-6" />}

      {cargandoDatos ? (
        <p className="text-gray-400 text-sm">Cargando datos...</p>
      ) : (
        <>
          <h2 className="text-sm font-medium text-gray-600 mb-2">Cuentas</h2>
          <div className="bg-white rounded-xl p-3 shadow-sm mb-6 space-y-2">
            {saldoCuentas.length === 0 && <p className="text-sm text-gray-400">No hay cuentas registradas.</p>}
            {saldoCuentas.map((c) => (
              <div key={c.cuenta_id} className="flex justify-between text-sm">
                <span>{c.nombre}</span>
                <span className="font-medium">{formatoCOP.format(c.saldo)}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <Link href="/capital" className="bg-white rounded-xl p-4 shadow-sm block">
              <p className="text-xs text-gray-500">Capital total</p>
              <p className="text-lg font-semibold text-blue-600">{formatoCOP.format(totalCapital)}</p>
              <p className="text-[10px] text-gray-400 mt-1">Ver detalle →</p>
            </Link>
            <Link href="/deuda" className="bg-white rounded-xl p-4 shadow-sm block">
              <p className="text-xs text-gray-500">Deuda total</p>
              <p className="text-lg font-semibold text-orange-600">{formatoCOP.format(totalDeuda)}</p>
              <p className="text-[10px] text-gray-400 mt-1">Ver detalle →</p>
            </Link>
          </div>

          {presupuesto.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-gray-600 mb-2">Presupuesto del periodo</h2>
              <div className="bg-white rounded-xl p-3 shadow-sm mb-6 space-y-3">
                {presupuesto.map((p) => {
                  const pct = p.presupuesto > 0 ? Math.min(100, (p.gastado / p.presupuesto) * 100) : 0;
                  return (
                    <div key={p.categoria_id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{p.nombre}</span>
                        <span>
                          {formatoCOP.format(p.gastado)} / {formatoCOP.format(p.presupuesto)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h2 className="text-sm font-medium text-gray-600 mb-2">Gasto por categoría (periodo seleccionado)</h2>
          <div className="bg-white rounded-xl p-3 shadow-sm mb-6" style={{ height: 220 }}>
            {gastoPorCategoria.length === 0 ? (
              <p className="text-sm text-gray-400">Sin gastos este mes.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gastoPorCategoria} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v) => formatoCOP.format(v)} />
                  <Bar dataKey="valor" fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}

      <Nav />
    </main>
  );
}
