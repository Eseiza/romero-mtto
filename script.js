/* ══════════════════════════════════════════════════════
   SUPABASE CONFIG
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://oyvqrxaslamvedfowqdg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dnFyeGFzbGFtdmVkZm93cWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMyMzEsImV4cCI6MjA5MDcyOTIzMX0.kBIMpczUhcjKHzQBWm9zwVAYUHCZR_Z9agYfeuj5ADo';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
/* ══════════════════════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════════════════════ */
let inventario  = [];
let userActual  = null;
let filtroAp    = 'todos';
let filtroPa    = 'todos';
let miGrafica   = null;
let realtimeSub = null;

const CLAVES = {
    guillermo:  'Guillermo123456',
    supervisor: 'Supervisor.2026',
    admin:      'Admin.2026',
    oficina:    'Oficina.2026'
};

// Roles con acceso de gestión (aprobar, rechazar, pagar)
const ROL_GESTOR = ['admin', 'supervisor'];

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
function setSyncDot(estado) {
    const dot = document.getElementById('syncDot');
    if (dot) dot.className = 'sync-dot ' + estado;
}

// Devuelve el estado visual de un registro
function estadoVisual(r) {
    if (r.Pagado)            return 'pagado';
    if (r.Aprobado === true) return 'aprobado';
    if (r.Aprobado === false) return 'rechazado';
    return 'pendiente';
}

// Genera el pill de estado HTML
function estadoPill(r) {
    const e = estadoVisual(r);
    const labels = {
        pendiente: '🔴 Pendiente',
        aprobado:  '🟡 Habilitado para pagar',
        pagado:    '🟢 Pagado',
        rechazado: '⚫ Rechazado'
    };
    return `<span class="estado-pill ${e}"><span class="pill-dot"></span>${labels[e]}</span>`;
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
});

/* ══════════════════════════════════════════════════════
   LOGIN / LOGOUT
══════════════════════════════════════════════════════ */
function login() {
    const user = document.getElementById('userSelect').value;
    const pass = document.getElementById('passInput').value;
    if (pass !== CLAVES[user]) { alert('Contraseña incorrecta.'); return; }

    userActual = user;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainSection').classList.remove('hidden');

    const nombres   = { guillermo: 'Guillermo', supervisor: 'Supervisor', admin: 'Administrador', oficina: 'Oficina' };
    const etiquetas = { guillermo: 'Carga', supervisor: 'Supervisor', admin: 'Acceso Total', oficina: 'Pagos' };
    const colores   = { guillermo: '#c8860a', supervisor: '#1a5080', admin: '#7a4a20', oficina: '#1a6080' };

    document.getElementById('welcomeText').innerHTML =
        'Hola, ' + nombres[user] + ' <span class="sync-dot" id="syncDot"></span>';

    const badge = document.getElementById('badge');
    badge.innerText = etiquetas[user];
    badge.style.backgroundColor = colores[user];

    document.querySelectorAll('.tab-btn').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach(t => {
        t.classList.remove('active');
        t.classList.add('hidden');
    });

    cargarDatos().then(() => {
        suscribirRealtime();
        if (user === 'guillermo') {
            mostrarTabs(['tab-carga', 'tab-historial']);
            activarTab('tab-carga');
        } else if (ROL_GESTOR.includes(user)) {
            mostrarTabs(['tab-carga', 'tab-historial', 'tab-aprobacion', 'tab-admin']);
            activarTab('tab-aprobacion');
        } else if (user === 'oficina') {
            mostrarTabs(['tab-pagos']);
            activarTab('tab-pagos');
        }
    });
}

function logout() {
    if (realtimeSub) { sb.removeChannel(realtimeSub); realtimeSub = null; }
    location.reload();
}

function mostrarTabs(ids) {
    ids.forEach(id => {
        const btn = document.querySelector(`[data-tab="${id}"]`);
        if (btn) btn.classList.remove('hidden');
    });
}

function activarTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.classList.add('hidden');
    });
    const btn     = document.querySelector(`[data-tab="${id}"]`);
    const content = document.getElementById(id);
    if (btn)     btn.classList.add('active');
    if (content) { content.classList.remove('hidden'); content.classList.add('active'); }

    if (id === 'tab-historial')  renderHistorial();
    if (id === 'tab-aprobacion') renderAprobaciones(filtroAp);
    if (id === 'tab-pagos')      renderPagos(filtroPa);
    if (id === 'tab-admin')      { setTimeout(initChart, 100); actualizarComparador(); }
}

/* ══════════════════════════════════════════════════════
   SUPABASE — CARGA Y REALTIME
══════════════════════════════════════════════════════ */
async function cargarDatos() {
    setSyncDot('syncing');
    const { data, error } = await sb
        .from('inventario')
        .select('*')
        .order('timestamp', { ascending: true });

    if (error) { console.error(error); setSyncDot('error'); return; }
    inventario = data || [];
    setSyncDot('ok');
    refrescarVistaActual();
}

function suscribirRealtime() {
    realtimeSub = sb
        .channel('inventario-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, () => {
            cargarDatos();
        })
        .subscribe();
}

function refrescarVistaActual() {
    const tab = document.querySelector('.tab-content.active');
    if (!tab) return;
    if (tab.id === 'tab-historial')  renderHistorial();
    if (tab.id === 'tab-aprobacion') renderAprobaciones(filtroAp);
    if (tab.id === 'tab-pagos')      renderPagos(filtroPa);
    if (tab.id === 'tab-admin')      { setTimeout(initChart, 100); actualizarComparador(); }
}

/* ══════════════════════════════════════════════════════
   REGISTRAR PIEZA
══════════════════════════════════════════════════════ */
function cambiarEtiquetaPrecio() {
    const modo = document.getElementById('modoPrecio').value;
    document.getElementById('labelMonto').innerText =
        modo === 'unitario' ? 'Precio por Unidad ($)' : 'Precio Total de Factura ($)';
}

async function agregarDato() {
    const nombre = document.getElementById('nombrePieza').value.trim();
    const cant   = parseInt(document.getElementById('cantidad').value) || 0;
    const monto  = parseFloat(document.getElementById('valor').value) || 0;
    const modo   = document.getElementById('modoPrecio').value;

    if (!nombre || cant <= 0 || monto <= 0) {
        alert('Completá los datos de Pieza, Cantidad y Monto.');
        return;
    }

    let precioUnitario, precioTotal;
    if (modo === 'unitario') {
        precioUnitario = monto;
        precioTotal    = monto * cant;
    } else {
        precioTotal    = monto;
        precioUnitario = monto / cant;
    }

    const ahora = new Date();
    const registro = {
        timestamp:    Date.now(),
        Mes:          ahora.toLocaleString('es-ES', { month: 'long' }),
        Fecha:        ahora.toLocaleDateString('es-AR'),
        Hora:         ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        Usuario:      userActual,
        Pieza:        nombre,
        Codigo:       document.getElementById('codigoPieza').value.trim(),
        Factura:      document.getElementById('numFactura').value.trim(),
        Estado:       document.getElementById('tipoPieza').value,
        Cantidad:     cant,
        Precio_Unit:  precioUnitario.toFixed(2),
        Total:        precioTotal.toFixed(2),
        Modo_Ingreso: modo,
        Descripcion:  document.getElementById('descripcion').value.trim(),
        Aprobado:     null,
        Comentario:   '',
        Pagado:       false
    };

    setSyncDot('syncing');
    const { error } = await sb.from('inventario').insert([registro]);
    if (error) { alert('Error al guardar: ' + error.message); setSyncDot('error'); return; }

    setSyncDot('ok');
    alert('¡Registro exitoso!');
    ['nombrePieza', 'codigoPieza', 'numFactura', 'valor', 'descripcion'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('cantidad').value = '1';
}

/* ══════════════════════════════════════════════════════
   HISTORIAL
══════════════════════════════════════════════════════ */
function renderHistorial() {
    const lista = document.getElementById('historialList');
    if (!lista) return;

    let items = userActual === 'guillermo'
        ? [...inventario].filter(r => r.Usuario === 'guillermo').reverse()
        : [...inventario].reverse();

    if (items.length === 0) {
        lista.innerHTML = '<p class="lista-empty">No hay registros todavía.</p>';
        return;
    }

    lista.innerHTML = items.slice(0, 80).map(r => {
        const ev = estadoVisual(r);
        const cardClass = ev === 'rechazado' ? 'estado-pendiente' : 'estado-' + ev;
        return `
        <div class="registro-card ${cardClass}">
            <div class="rc-top">
                <div class="rc-info">
                    <div class="rc-nombre">${r.Pieza}</div>
                    <div class="rc-meta">
                        ${r.Estado} · Cant: ${r.Cantidad}
                        ${r.Factura ? '· Fac: ' + r.Factura : ''}
                        ${r.Codigo  ? '· Cód: ' + r.Codigo  : ''}
                        · Por: ${r.Usuario}
                    </div>
                </div>
                <div class="rc-right">
                    <div class="rc-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                    ${estadoPill(r)}
                    <div style="font-size:11px;color:var(--brown-light)">${r.Fecha} ${r.Hora}</div>
                </div>
            </div>
        </div>`;
    }).join('');
}

/* ══════════════════════════════════════════════════════
   APROBACIONES (Supervisor + Admin)
══════════════════════════════════════════════════════ */
function renderAprobaciones(filtro) {
    filtroAp = filtro;
    document.querySelectorAll('[data-fap]').forEach(b =>
        b.classList.toggle('active', b.dataset.fap === filtro));

    const resumen = document.getElementById('aprobacionResumen');
    const lista   = document.getElementById('aprobacionList');
    if (!lista) return;

    const nPend  = inventario.filter(r => r.Aprobado === null).length;
    const nApro  = inventario.filter(r => r.Aprobado === true && !r.Pagado).length;
    const nPagad = inventario.filter(r => r.Pagado).length;

    if (resumen) {
        resumen.innerHTML = `
            <div class="resumen-card rc-neutro">
                <div class="resumen-label">Total</div>
                <div class="resumen-valor">${inventario.length}</div>
            </div>
            <div class="resumen-card rc-rojo">
                <div class="resumen-label">🔴 Pendientes</div>
                <div class="resumen-valor">${nPend}</div>
            </div>
            <div class="resumen-card rc-amarillo">
                <div class="resumen-label">🟡 Para pagar</div>
                <div class="resumen-valor">${nApro}</div>
            </div>
            <div class="resumen-card rc-verde">
                <div class="resumen-label">🟢 Pagados</div>
                <div class="resumen-valor">${nPagad}</div>
            </div>`;
    }

    let items = [...inventario].reverse();
    if (filtro === 'pendientes') items = items.filter(r => r.Aprobado === null);
    if (filtro === 'aprobados')  items = items.filter(r => r.Aprobado === true && !r.Pagado);
    if (filtro === 'rechazados') items = items.filter(r => r.Aprobado === false);
    if (filtro === 'pagados')    items = items.filter(r => r.Pagado);

    if (items.length === 0) {
        lista.innerHTML = '<p class="lista-empty">No hay registros en esta categoría.</p>';
        return;
    }

    lista.innerHTML = items.map(r => {
        const ev        = estadoVisual(r);
        const cardClass = ev === 'rechazado' ? 'estado-pendiente' : 'estado-' + ev;
        let acciones    = '';

        if (r.Aprobado === null) {
            // Pendiente → habilitar o rechazar
            acciones = `
                <textarea class="comentario-input" id="com-${r.id}"
                    placeholder="Comentario opcional..."></textarea>
                <div class="rc-acciones">
                    <button class="btn-accion aprobar"  onclick="aprobar(${r.id})">🟡 Habilitar pago</button>
                    <button class="btn-accion rechazar" onclick="rechazar(${r.id})">✕ Rechazar</button>
                </div>`;
        } else if (r.Aprobado === true && !r.Pagado) {
            // Habilitado → marcar pagado o deshacer
            acciones = `
                <div class="rc-acciones">
                    <button class="btn-accion pagar"   onclick="marcarPagado(${r.id})">🟢 Marcar como pagado</button>
                    <button class="btn-accion deshacer" onclick="deshacerDecision(${r.id})">↩ Deshacer</button>
                </div>
                ${r.Comentario ? `<div class="comentario-guardado"><strong>Nota:</strong> ${r.Comentario}</div>` : ''}`;
        } else if (r.Pagado) {
            // Pagado → deshacer pago
            acciones = `
                <div class="rc-acciones">
                    <button class="btn-accion deshacer" onclick="deshacerPago(${r.id})">↩ Deshacer pago</button>
                </div>
                ${r.Comentario ? `<div class="comentario-guardado"><strong>Nota:</strong> ${r.Comentario}</div>` : ''}`;
        } else if (r.Aprobado === false) {
            // Rechazado → reabrir
            acciones = `
                <div class="rc-acciones">
                    <button class="btn-accion deshacer" onclick="deshacerDecision(${r.id})">↩ Reabrir</button>
                </div>
                ${r.Comentario ? `<div class="comentario-guardado"><strong>Motivo:</strong> ${r.Comentario}</div>` : ''}`;
        }

        return `
        <div class="registro-card ${cardClass}">
            <div class="rc-top">
                <div class="rc-info">
                    <div class="rc-nombre">${r.Pieza}</div>
                    <div class="rc-meta">
                        ${r.Fecha} ${r.Hora} · ${r.Estado} · Cant: ${r.Cantidad}<br>
                        ${r.Factura ? 'Fac: ' + r.Factura + ' · ' : ''}
                        ${r.Codigo  ? 'Cód: ' + r.Codigo  + ' · ' : ''}
                        Por: <strong>${r.Usuario}</strong>
                    </div>
                </div>
                <div class="rc-right">
                    <div class="rc-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                    ${estadoPill(r)}
                </div>
            </div>
            ${acciones}
        </div>`;
    }).join('');
}

async function aprobar(id) {
    const comentario = document.getElementById(`com-${id}`)?.value.trim() || '';
    setSyncDot('syncing');
    await sb.from('inventario').update({ Aprobado: true, Comentario: comentario, Pagado: false }).eq('id', id);
    setSyncDot('ok');
    await cargarDatos();
}

async function rechazar(id) {
    const comentario = document.getElementById(`com-${id}`)?.value.trim() || '';
    setSyncDot('syncing');
    await sb.from('inventario').update({ Aprobado: false, Comentario: comentario }).eq('id', id);
    setSyncDot('ok');
    await cargarDatos();
}

async function marcarPagado(id) {
    setSyncDot('syncing');
    await sb.from('inventario').update({ Pagado: true }).eq('id', id);
    setSyncDot('ok');
    await cargarDatos();
}

async function deshacerDecision(id) {
    setSyncDot('syncing');
    await sb.from('inventario').update({ Aprobado: null, Comentario: '', Pagado: false }).eq('id', id);
    setSyncDot('ok');
    await cargarDatos();
}

async function deshacerPago(id) {
    setSyncDot('syncing');
    await sb.from('inventario').update({ Pagado: false }).eq('id', id);
    setSyncDot('ok');
    await cargarDatos();
}

/* ══════════════════════════════════════════════════════
   PAGOS (OFICINA)
══════════════════════════════════════════════════════ */
function renderPagos(filtro) {
    filtroPa = filtro;
    document.querySelectorAll('[data-fpa]').forEach(b =>
        b.classList.toggle('active', b.dataset.fpa === filtro));

    const lista   = document.getElementById('pagosList');
    const resumen = document.getElementById('pagosResumen');
    if (!lista) return;

    const aprobados     = inventario.filter(r => r.Aprobado === true);
    const sumaPagada    = aprobados.filter(r => r.Pagado).reduce((a, r) => a + parseFloat(r.Total), 0);
    const sumaPendiente = aprobados.filter(r => !r.Pagado).reduce((a, r) => a + parseFloat(r.Total), 0);

    if (resumen) {
        resumen.innerHTML = `
            <div class="resumen-card rc-neutro">
                <div class="resumen-label">Total habilitados</div>
                <div class="resumen-valor">${aprobados.length}</div>
            </div>
            <div class="resumen-card rc-amarillo">
                <div class="resumen-label">🟡 Por pagar</div>
                <div class="resumen-valor">$${sumaPendiente.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>
            <div class="resumen-card rc-verde">
                <div class="resumen-label">🟢 Pagado</div>
                <div class="resumen-valor">$${sumaPagada.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>`;
    }

    let items = [...aprobados].reverse();
    if (filtro === 'pagados')    items = items.filter(r => r.Pagado);
    if (filtro === 'pendientes') items = items.filter(r => !r.Pagado);

    if (items.length === 0) {
        lista.innerHTML = '<p class="lista-empty">No hay registros en esta categoría.</p>';
        return;
    }

    lista.innerHTML = items.map(r => {
        const ev = r.Pagado ? 'pagado' : 'aprobado';
        return `
        <div class="registro-card estado-${ev}">
            <div class="rc-top">
                <div class="rc-info">
                    <div class="rc-nombre">${r.Pieza}</div>
                    <div class="rc-meta">
                        ${r.Fecha} · ${r.Estado} · Cant: ${r.Cantidad}
                        ${r.Factura ? '· Fac: ' + r.Factura : ''}
                        ${r.Comentario ? ' · <em>' + r.Comentario + '</em>' : ''}
                    </div>
                </div>
                <div class="rc-right">
                    <div class="rc-total">$${parseFloat(r.Total).toLocaleString('es-AR')}</div>
                    ${estadoPill(r)}
                </div>
            </div>
            <div class="rc-acciones">
                <button class="btn-accion ${r.Pagado ? 'deshacer' : 'pagar'}" onclick="togglePago(${r.id})">
                    ${r.Pagado ? '↩ Deshacer pago' : '🟢 Marcar como pagado'}
                </button>
            </div>
        </div>`;
    }).join('');
}

async function togglePago(id) {
    const item = inventario.find(r => r.id === id);
    if (!item) return;
    setSyncDot('syncing');
    await sb.from('inventario').update({ Pagado: !item.Pagado }).eq('id', id);
    setSyncDot('ok');
    await cargarDatos();
}

/* ══════════════════════════════════════════════════════
   GRÁFICA
══════════════════════════════════════════════════════ */
function initChart() {
    const ctx = document.getElementById('miGrafica');
    if (!ctx) return;
    if (miGrafica) miGrafica.destroy();

    miGrafica = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: inventario.map(d => d.Fecha + ' ' + d.Hora),
            datasets: [{
                label: 'Inversión ($)',
                data: inventario.map(d => parseFloat(d.Total)),
                borderColor: '#c8860a',
                backgroundColor: 'rgba(200,134,10,0.10)',
                pointBackgroundColor: '#c8420a',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#7a4a20', font: { family: 'Nunito', weight: '700', size: 13 } }
                }
            },
            scales: {
                x: { ticks: { color: '#a07840', font: { family: 'Nunito', size: 11 } }, grid: { color: 'rgba(200,160,90,0.12)' } },
                y: { ticks: { color: '#a07840', font: { family: 'Nunito', size: 11 } }, grid: { color: 'rgba(200,160,90,0.12)' } }
            }
        }
    });
}

/* ══════════════════════════════════════════════════════
   COMPARATIVA MENSUAL
══════════════════════════════════════════════════════ */
function actualizarComparador() {
    const grid = document.getElementById('statsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const totales = inventario.reduce((acc, curr) => {
        acc[curr.Mes] = (acc[curr.Mes] || 0) + parseFloat(curr.Total);
        return acc;
    }, {});

    for (const [mes, dinero] of Object.entries(totales)) {
        grid.innerHTML += `
            <div class="stat-card">
                <div class="stat-month">${mes}</div>
                <div class="stat-value">$${dinero.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>`;
    }
}

/* ══════════════════════════════════════════════════════
   EXCEL
══════════════════════════════════════════════════════ */
function exportarExcel() {
    if (inventario.length === 0) { alert('No hay registros para exportar.'); return; }
    const wb    = XLSX.utils.book_new();
    const meses = [...new Set(inventario.map(r => r.Mes))];
    meses.forEach(mes => {
        const ws = XLSX.utils.json_to_sheet(inventario.filter(r => r.Mes === mes));
        XLSX.utils.book_append_sheet(wb, ws, mes.toUpperCase());
    });
    XLSX.writeFile(wb, 'Inventario_RomeroPanificados.xlsx');
}

/* ══════════════════════════════════════════════════════
   BORRAR HISTORIAL
══════════════════════════════════════════════════════ */
async function limpiarTodo() {
    if (!confirm('¿Borrar todo el historial? Esta acción no se puede deshacer.')) return;
    setSyncDot('syncing');
    await sb.from('inventario').delete().neq('id', 0);
    setSyncDot('ok');
    inventario = [];
    refrescarVistaActual();
}
