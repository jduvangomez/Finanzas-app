'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = {
  primary: '#5b4bb7',
  secondary: '#7f77dd',
  accent1: '#d4537e',
  accent2: '#1d9e75',
  danger: '#e24b4a',
  success: '#639922',
  warning: '#ba7517',
  bg: '#f8f7fc',
  card: '#ffffff',
  text: '#2c2c2a',
  textSecondary: '#888780',
  border: '#e0e0e0',
};

export default function Dashboard() {
  const [selectedProject, setSelectedProject] = useState('Personal');
  const [dateRange, setDateRange] = useState('mes');
  const [activeTab, setActiveTab] = useState('overview');

  const [stats, setStats] = useState({
    totalGasto: 0,
    totalIngreso: 0,
    totalPresupuesto: 0,
    consumoPresupuesto: 0,
    ratioAhorro: 0,
    gastoMesAnterior: 0,
    ingresoMesAnterior: 0,
  });

  const [categoriaData, setCategoriaData] = useState([]);
  const [top3Gastos, setTop3Gastos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [presupuestoPorCategoria, setPresupuestoPorCategoria] = useState([]);
  const [capitalDeuda, setCapitalDeuda] = useState({ capital: 0, deuda: 0 });
  const [proyeccionSaldo, setProyeccionSaldo] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, [selectedProject, dateRange]);

  const getDateRange = () => {
    const today = new Date();
    let startDate, endDate = today;

    switch (dateRange) {
      case 'semana':
        startDate = new Date(today.setDate(today.getDate() - 7));
        break;
      case 'mes':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'trimestre':
        startDate = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
        endDate = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0);
        break;
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { start, end } = getDateRange();
      const currentDate = new Date();
      const mesAnterior = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const finMesAnterior = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

      const { data: movActual } = await supabase
        .from('Movimiento')
        .select(`
          id, monto, fecha, tipo,
          Subcategoria(id, nombre, Categoria(id, nombre, Tipo(nombre))),
          Etiqueta(nombre)
        `)
        .eq('user_email', user.email)
        .eq('proyecto', selectedProject)
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: false });

      const { data: movMesAnterior } = await supabase
        .from('Movimiento')
        .select(`id, monto, fecha, tipo`)
        .eq('user_email', user.email)
        .eq('proyecto', selectedProject)
        .gte('fecha', mesAnterior.toISOString().split('T')[0])
        .lte('fecha', finMesAnterior.toISOString().split('T')[0]);

      const { data: movimientosCapital } = await supabase
        .from('Movimiento')
        .select(`monto, tipo, Subcategoria(Categoria(Tipo(nombre)))`)
        .eq('user_email', user.email)
        .eq('proyecto', selectedProject);

      procesarDatos(movActual, movMesAnterior, movimientosCapital, user.email);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const procesarDatos = async (movActual, movMesAnterior, movimientosCapital, userEmail) => {
    const gastos = movActual?.filter(m => m.tipo === 'gasto') || [];
    const ingresos = movActual?.filter(m => m.tipo === 'ingreso') || [];

    const totalGastos = gastos.reduce((sum, m) => sum + m.monto, 0);
    const totalIngresos = ingresos.reduce((sum, m) => sum + m.monto, 0);

    const gastosMesAnterior = (movMesAnterior?.filter(m => m.tipo === 'gasto') || [])
      .reduce((sum, m) => sum + m.monto, 0);
    const ingresosMesAnterior = (movMesAnterior?.filter(m => m.tipo === 'ingreso') || [])
      .reduce((sum, m) => sum + m.monto, 0);

    let totalCapital = 0;
    let totalDeuda = 0;
    movimientosCapital?.forEach(m => {
      const tipoMovimiento = m.Subcategoria?.Categoria?.Tipo?.nombre;
      if (tipoMovimiento === 'Capital') totalCapital += m.monto;
      if (tipoMovimiento === 'Deuda') totalDeuda += m.monto;
    });

    const categoriaMap = {};
    gastos.forEach(m => {
      const catName = m.Subcategoria?.Categoria?.nombre || 'Otros';
      categoriaMap[catName] = (categoriaMap[catName] || 0) + m.monto;
    });

    const topGastos = gastos
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 3)
      .map(m => ({
        id: m.id,
        descripcion: m.Subcategoria?.nombre || 'Movimiento',
        monto: m.monto,
        categoria: m.Subcategoria?.Categoria?.nombre,
        fecha: m.fecha,
      }));

    const chartData = Object.entries(categoriaMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name,
        value: parseFloat(value.toFixed(2)),
      }));

    const presupuestoCategorizado = chartData.map(cat => ({
      ...cat,
      presupuesto: Math.round((cat.value / totalGastos) * (totalIngresos * 0.6)),
      excedido: false,
    }));

    const ratioAhorro = totalIngresos > 0 ? ((totalIngresos - totalGastos) / totalIngresos) * 100 : 0;

    const diasTranscurridos = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const proyeccionGastos = (totalGastos / diasTranscurridos) * diasMes;
    const saldoProyectado = totalIngresos - proyeccionGastos;

    setStats({
      totalGasto: totalGastos,
      totalIngreso: totalIngresos,
      totalPresupuesto: totalIngresos * 0.6,
      consumoPresupuesto: Math.round((totalGastos / (totalIngresos * 0.6)) * 100),
      ratioAhorro: ratioAhorro.toFixed(1),
      gastoMesAnterior: gastosMesAnterior,
      ingresoMesAnterior: ingresosMesAnterior,
    });

    setCategoriaData(chartData);
    setPresupuestoPorCategoria(presupuestoCategorizado);
    setTop3Gastos(topGastos);
    setMovimientos(movActual?.slice(0, 10) || []);
    setCapitalDeuda({ capital: totalCapital, deuda: totalDeuda });
    setProyeccionSaldo(saldoProyectado);

    await generarTendencia(userEmail);
  };

  const generarTendencia = async (userEmail) => {
    const meses = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      meses.push({
        fecha: date.toISOString().split('T')[0].substring(0, 7),
        label: date.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }),
      });
    }

    const { data: movimientos } = await supabase
      .from('Movimiento')
      .select('monto, tipo, fecha')
      .eq('user_email', userEmail)
      .eq('proyecto', selectedProject);

    const tendenciaData = meses.map(mes => {
      const movMes = movimientos?.filter(m => m.fecha.startsWith(mes.fecha)) || [];
      const gastos = movMes.filter(m => m.tipo === 'gasto').reduce((sum, m) => sum + m.monto, 0);
      const ingresos = movMes.filter(m => m.tipo === 'ingreso').reduce((sum, m) => sum + m.monto, 0);

      return {
        mes: mes.label,
        gastos: parseFloat(gastos.toFixed(2)),
        ingresos: parseFloat(ingresos.toFixed(2)),
      };
    });

    setTendencia(tendenciaData);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const calcularVariacion = (actual, anterior) => {
    if (anterior === 0) return 0;
    return (((actual - anterior) / anterior) * 100).toFixed(1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';

    return date.toLocaleDateString('es-CO', { day: 'short', month: 'short' });
  };

  if (loading) {
    return <div className="p-4 text-center">Cargando dashboard...</div>;
  }

  const variacionGasto = calcularVariacion(stats.totalGasto, stats.gastoMesAnterior);
  const variacionIngreso = calcularVariacion(stats.totalIngreso, stats.ingresoMesAnterior);

  return (
    <div style={{ backgroundColor: COLORS.bg, minHeight: '100vh', paddingBottom: '80px' }}>
      {/* HEADER */}
      <div
        style={{
          background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%)`,
          color: 'white',
          padding: '1.5rem 1rem',
          borderRadius: '0 0 24px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>Bienvenido</p>
            <h1 style={{ margin: '0.25rem 0 0', fontSize: '24px', fontWeight: 600 }}>Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['Personal', 'Hogar'].map((proj) => (
              <button
                key={proj}
                onClick={() => setSelectedProject(proj)}
                style={{
                  background: selectedProject === proj ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: selectedProject === proj ? 600 : 400,
                  transition: 'all 0.2s',
                }}
              >
                {proj}
              </button>
            ))}
          </div>
        </div>

        {/* FILTRO FECHAS */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {['semana', 'mes', 'trimestre'].map((rango) => (
            <button
              key={rango}
              onClick={() => setDateRange(rango)}
              style={{
                background: dateRange === rango ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {rango === 'semana' ? 'Última semana' : rango === 'mes' ? 'Este mes' : 'Este trimestre'}
            </button>
          ))}
        </div>

        {/* RESUMEN INGRESOS/GASTOS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>Ingresos</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '20px', fontWeight: 700 }}>
              {formatCurrency(stats.totalIngreso)}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.8 }}>
              {variacionIngreso > 0 ? '📈' : '📉'} {variacionIngreso}% vs mes anterior
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.85 }}>Gastos</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '20px', fontWeight: 700 }}>
              {formatCurrency(stats.totalGasto)}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.8 }}>
              {variacionGasto > 0 ? '📈' : '📉'} {variacionGasto}% vs mes anterior
            </p>
          </div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* KPIs PRINCIPALES */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {/* Ratio Ahorro */}
          <div
            style={{
              background: COLORS.card,
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: COLORS.textSecondary }}>Ratio de Ahorro</p>
            <p style={{ margin: '0.5rem 0', fontSize: '20px', fontWeight: 600, color: COLORS.text }}>
              {stats.ratioAhorro}%
            </p>
            <p style={{ margin: 0, fontSize: '11px', color: stats.ratioAhorro > 20 ? COLORS.success : COLORS.warning }}>
              {stats.ratioAhorro > 20 ? '✓ Saludable' : '⚠️ Revisar'}
            </p>
          </div>

          {/* Presupuesto */}
          <div
            style={{
              background: COLORS.card,
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: COLORS.textSecondary }}>Presupuesto Usado</p>
            <p style={{ margin: '0.5rem 0', fontSize: '20px', fontWeight: 600, color: stats.consumoPresupuesto > 80 ? COLORS.danger : COLORS.text }}>
              {stats.consumoPresupuesto}%
            </p>
            {stats.consumoPresupuesto > 80 && (
              <p style={{ margin: 0, fontSize: '11px', color: COLORS.danger }}>🚨 Presupuesto excedido</p>
            )}
          </div>

          {/* Capital */}
          <div
            style={{
              background: COLORS.card,
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: COLORS.textSecondary }}>Capital</p>
            <p style={{ margin: '0.5rem 0', fontSize: '18px', fontWeight: 600, color: COLORS.success }}>
              {formatCurrency(capitalDeuda.capital)}
            </p>
          </div>

          {/* Deuda */}
          <div
            style={{
              background: COLORS.card,
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: COLORS.textSecondary }}>Deuda</p>
            <p style={{ margin: '0.5rem 0', fontSize: '18px', fontWeight: 600, color: COLORS.danger }}>
              {formatCurrency(capitalDeuda.deuda)}
            </p>
          </div>
        </div>

        {/* PROYECCIÓN SALDO */}
        {dateRange === 'mes' && (
          <div
            style={{
              background: proyeccionSaldo > 0 ? 'rgba(99, 153, 34, 0.1)' : 'rgba(226, 75, 74, 0.1)',
              border: `1px solid ${proyeccionSaldo > 0 ? COLORS.success : COLORS.danger}`,
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: COLORS.text }}>📊 Proyección a fin de mes</p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '18px', fontWeight: 600, color: proyeccionSaldo > 0 ? COLORS.success : COLORS.danger }}>
              {formatCurrency(proyeccionSaldo)}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: COLORS.textSecondary }}>
              {proyeccionSaldo > 0 ? 'Si mantienes este ritmo ahorrarás' : 'Si mantienes este ritmo gastarás más'}
            </p>
          </div>
        )}

        {/* TABS */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: `1px solid ${COLORS.border}` }}>
          {['overview', 'presupuesto', 'tendencia'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? `3px solid ${COLORS.primary}` : 'none',
                color: activeTab === tab ? COLORS.primary : COLORS.textSecondary,
                padding: '10px 0 8px',
                fontSize: '13px',
                fontWeight: activeTab === tab ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {tab === 'overview' ? 'Resumen' : tab === 'presupuesto' ? 'Presupuesto' : 'Tendencia'}
            </button>
          ))}
        </div>

        {/* TAB OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            {/* Gasto por categoría */}
            <div
              style={{
                background: COLORS.card,
                border: `0.5px solid ${COLORS.border}`,
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ margin: '0 0 1rem', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                Gasto por Categoría
              </h3>
              {categoriaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categoriaData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill={COLORS.primary} />
                      <Cell fill={COLORS.secondary} />
                      <Cell fill={COLORS.accent1} />
                      <Cell fill={COLORS.accent2} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: 'center', color: COLORS.textSecondary }}>Sin datos</div>
              )}
            </div>

            {/* Top 3 Gastos */}
            <div
              style={{
                background: COLORS.card,
                border: `0.5px solid ${COLORS.border}`,
                borderRadius: '12px',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ margin: '0 0 1rem', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                🔥 Top 3 Gastos
              </h3>
              {top3Gastos.map((gasto, idx) => (
                <div
                  key={gasto.id}
                  style={{
                    padding: '1rem 0',
                    borderTop: idx === 0 ? 'none' : `0.5px solid ${COLORS.border}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: COLORS.text }}>
                        {idx + 1}. {gasto.descripcion}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: COLORS.textSecondary }}>
                        {gasto.categoria} • {formatDate(gasto.fecha)}
                      </p>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: COLORS.danger }}>
                      -{formatCurrency(gasto.monto)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Movimientos recientes */}
            <div
              style={{
                background: COLORS.card,
                border: `0.5px solid ${COLORS.border}`,
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <h3 style={{ margin: '1rem 1rem 0', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
                Movimientos Recientes
              </h3>
              {movimientos.length > 0 ? (
                movimientos.map((mov, idx) => (
                  <div
                    key={mov.id}
                    style={{
                      padding: '1rem',
                      borderTop: idx === 0 ? 'none' : `0.5px solid ${COLORS.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: COLORS.text }}>
                        {mov.Subcategoria?.nombre}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: COLORS.textSecondary }}>
                        {formatDate(mov.fecha)} • {mov.Subcategoria?.Categoria?.nombre}
                      </p>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: mov.tipo === 'gasto' ? COLORS.danger : COLORS.success }}>
                      {mov.tipo === 'gasto' ? '−' : '+'}
                      {formatCurrency(mov.monto)}
                    </p>
                  </div>
                ))
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', color: COLORS.textSecondary }}>
                  Sin movimientos
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB PRESUPUESTO */}
        {activeTab === 'presupuesto' && (
          <div
            style={{
              background: COLORS.card,
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
              Presupuesto por Categoría
            </h3>
            {presupuestoPorCategoria.map((cat, idx) => {
              const excedido = cat.value > cat.presupuesto;
              return (
                <div key={idx} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: COLORS.text }}>
                      {cat.name}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: excedido ? COLORS.danger : COLORS.text }}>
                      {formatCurrency(cat.value)} / {formatCurrency(cat.presupuesto)}
                    </p>
                  </div>
                  <div style={{ height: '8px', background: COLORS.border, borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min((cat.value / cat.presupuesto) * 100, 100)}%`,
                        background: excedido ? COLORS.danger : COLORS.success,
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  {excedido && (
                    <p style={{ margin: '4px 0 0', fontSize: '11px', color: COLORS.danger }}>
                      🚨 Excedido por {formatCurrency(cat.value - cat.presupuesto)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB TENDENCIA */}
        {activeTab === 'tendencia' && (
          <div
            style={{
              background: COLORS.card,
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '14px', fontWeight: 600, color: COLORS.text }}>
              Tendencia últimos 3 meses
            </h3>
            {tendencia.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" style={{ fontSize: '12px' }} />
                  <YAxis style={{ fontSize: '12px' }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="gastos"
                    stroke={COLORS.danger}
                    strokeWidth={2}
                    name="Gastos"
                  />
                  <Line
                    type="monotone"
                    dataKey="ingresos"
                    stroke={COLORS.success}
                    strokeWidth={2}
                    name="Ingresos"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', color: COLORS.textSecondary }}>Sin datos históricos</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
