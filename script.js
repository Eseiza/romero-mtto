/* ══════════════════════════════════════════════════════
   CONFIGURACIÓN DE SUPABASE
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://oyvqrxaslamvedfowqdg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dnFyeGFzbGFtdmVkZm93cWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMyMzEsImV4cCI6MjA5MDcyOTIzMX0.kBIMpczUhcjKHzQBWm9zwVAYUHCZR_Z9agYfeuj5ADo';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── VARIABLES DE ESTADO ───────────────────────────── */
let currentUser = null;
let registrosGlobales = [];

/* ── INICIALIZACIÓN ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Simulación de carga inicial (puedes conectar con Auth de Supabase luego)
    setTimeout(() => {
        const loader = document.getElementById('loadingOverlay');
        const login = document.querySelector('.login-wrap');
        if (loader) loader.classList.add('hidden');
        if (login) login.classList.remove('hidden');
    }, 1200);
}

/* ── LÓGICA DE LOGIN ───────────────────────────────── */
async function login() {
    const user = document.getElementById('userSelect').value;
    const pass = document.getElementById('passInput').value;

    if (pass === "1234") { // Validación simple para Testing
        currentUser = user;
        document.querySelector('.login-wrap').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('userNameDisplay').innerText = `Hola, ${user}`;
        
        configurarInterfazPorRol(user);
        cargarDatos();
    } else {
        alert("Contraseña incorrecta");
    }
}

function configurarInterfazPorRol(rol) {
    const badge = document.getElementById('userRoleBadge');
    badge.innerText = rol.toUpperCase();
    
    // Ocultar tabs según permiso
    const tabAdmin = document.querySelector('[data-tab="tab-admin"]');
    if (rol !== 'admin' && tabAdmin) tabAdmin.classList.add('hidden');
}

/* ── GESTIÓN DE TABS ────────────────────────────────── */
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'tab-historial') cargarDatos();
}

/* ── OPERACIONES CRUD (SUPABASE) ────────────────────── */
async function guardarPieza() {
    const form = {
        nombre_pieza: document.getElementById('nombrePieza').value,
        codigo: document.getElementById('codigoPieza').value,
        n_factura: document.getElementById('nFactura').value,
        estado_pieza: document.getElementById('estadoPieza').value,
        cantidad: parseInt(document.getElementById('cantidadPieza').value) || 0,
        tipo_precio: document.getElementById('tipoPrecio').value,
        monto: parseFloat(document.getElementById('montoPieza').value) || 0,
        descripcion: document.getElementById('descripcionPieza').value,
        estado_pago: 'pendiente', // Default inicial (Semáforo Rojo)
        fecha: new Date().toISOString()
    };

    try {
        const { error } = await sb.from('inventario').insert([form]);
        if (error) throw error;
        
        alert("Registro guardado con éxito");
        limpiarFormulario();
        switchTab('tab-historial');
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function cargarDatos() {
    const container = document.getElementById('listaRegistros');
    container.innerHTML = '<div class="lista-empty">Cargando registros...</div>';

    try {
        const { data, error } = await sb
            .from('inventario')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) throw error;
        registrosGlobales = data;
        renderizarLista(data);
        actualizarResumen(data);
    } catch (err) {
        container.innerHTML = `<div class="lista-empty">Error al conectar: ${err.message}</div>`;
    }
}

/* ── RENDERIZADO Y FILTROS ─────────────────────────── */
function renderizarLista(items) {
    const container = document.getElementById('listaRegistros');
    if (items.length === 0) {
        container.innerHTML = '<div class="lista-empty">No hay registros para mostrar.</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="registro-card estado-${item.estado_pago}">
            <div class="rc-top">
                <div class="rc-info">
                    <div class="rc-nombre">${item.nombre_pieza}</div>
                    <div class="rc-meta">Factura: ${item.n_factura} | Cant: ${item.cantidad}</div>
                </div>
                <div class="rc-right">
                    <div class="rc-total">$${item.monto.toLocaleString()}</div>
                    <span class="estado-pill ${item.estado_pago}">
                        <i class="pill-dot"></i> ${item.estado_pago.toUpperCase()}
                    </span>
                </div>
            </div>
            ${renderAccionesPorRol(item)}
        </div>
    `).join('');
}

function renderAccionesPorRol(item) {
    // Solo Oficina y Admin pueden cambiar estados
    if (currentUser === 'carga') return '';
    
    let botones = '';
    if (item.estado_pago === 'pendiente') {
        botones = `<button class="btn-accion aprobar" onclick="cambiarEstado('${item.id}', 'aprobado')">Habilitar Pago</button>`;
    } else if (item.estado_pago === 'aprobado') {
        botones = `<button class="btn-accion pagar" onclick="cambiarEstado('${item.id}', 'pagado')">Marcar como Pagado</button>`;
    }
    
    return `<div class="rc-acciones">${botones}</div>`;
}

async function cambiarEstado(id, nuevoEstado) {
    try {
        const { error } = await sb.from('inventario').update({ estado_pago: nuevoEstado }).eq('id', id);
        if (error) throw error;
        cargarDatos();
    } catch (err) {
        alert("Error al actualizar: " + err.message);
    }
}

function filtrar(tipo) {
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (tipo === 'todos') {
        renderizarLista(registrosGlobales);
    } else {
        const filtrados = registrosGlobales.filter(r => r.estado_pago === tipo);
        renderizarLista(filtrados);
    }
}

/* ── UTILIDADES ────────────────────────────────────── */
function actualizarResumen(data) {
    const stats = {
        total: data.reduce((acc, r) => acc + r.monto, 0),
        pend: data.filter(r => r.estado_pago === 'pendiente').length,
        pagado: data.filter(r => r.estado_pago === 'pagado').length
    };
    
    // Asignar a los elementos del DOM (asegúrate de tener estos IDs en el HTML)
    if(document.getElementById('statTotal')) document.getElementById('statTotal').innerText = `$${stats.total.toLocaleString()}`;
}

function limpiarFormulario() {
    document.querySelectorAll('.field input, .field textarea').forEach(i => i.value = '');
}

function logout() {
    location.reload();
}

// Exponer funciones al scope global para los onclick del HTML
window.login = login;
window.switchTab = switchTab;
window.guardarPieza = guardarPieza;
window.cambiarEstado = cambiarEstado;
window.filtrar = filtrar;
window.logout = logout;
