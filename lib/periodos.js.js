const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export function rangoMes(año, mes) {
  const inicio = new Date(Date.UTC(año, mes - 1, 1));
  const fin = new Date(Date.UTC(año, mes, 0));
  return { inicio: toISODate(inicio), fin: toISODate(fin) };
}

export function rangoQuincena(año, mes, quincena) {
  if (quincena === 1) {
    const inicio = new Date(Date.UTC(año, mes - 1, 1));
    const fin = new Date(Date.UTC(año, mes - 1, 15));
    return { inicio: toISODate(inicio), fin: toISODate(fin) };
  }
  const inicio = new Date(Date.UTC(año, mes - 1, 16));
  const finMes = new Date(Date.UTC(año, mes, 0));
  return { inicio: toISODate(inicio), fin: toISODate(finMes) };
}

export function etiquetaPeriodo(año, mes, quincena) {
  if (!quincena) return `${NOMBRES_MES[mes - 1]} ${año}`;
  return `${quincena === 1 ? '1ra' : '2da'} q. ${NOMBRES_MES[mes - 1].slice(0, 3)} ${año}`;
}

// Genera una lista de n periodos consecutivos que terminan en (año, mes, quincena), en orden cronológico.
// quincena = null para periodos mensuales, 1 o 2 para quincenales.
export function periodosAnteriores(año, mes, quincena, n) {
  const periodos = [];
  let a = año;
  let m = mes;
  let q = quincena;

  for (let i = 0; i < n; i++) {
    periodos.unshift({ año: a, mes: m, quincena: q });

    if (q === null || q === undefined) {
      m -= 1;
      if (m < 1) {
        m = 12;
        a -= 1;
      }
    } else if (q === 2) {
      q = 1;
    } else {
      q = 2;
      m -= 1;
      if (m < 1) {
        m = 12;
        a -= 1;
      }
    }
  }

  return periodos;
}
