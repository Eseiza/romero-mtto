/* ══════════════════════════════════════════════════════
   1. CONFIGURACIÓN DE SUPABASE (ROMERO PANIFICADOS)
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://oyvqrxaslamvedfowqdg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dnFyeGFzbGFtdmVkZm93cWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMyMzEsImV4cCI6MjA5MDcyOTIzMX0.kBIMpczUhcjKHzQBWm9zwVAYUHCZR_Z9agYfeuj5ADo';

// Inicializar cliente una sola vez
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── BASE DE USUARIOS Y ROLES ──────────────────────── */
const USERS_DB = {
    "guillermo": { pass: "guille2026", role: "carga" },
    "oficina":   { pass: "oficina77",   role: "oficina" },
    "admin":     { pass: "adminromero", role: "admin" }
};

let currentUserRole = null;
let registrosGlobales = [];

/* ══════════════════════════════════════════════════════
   2. LÓGICA DE ACCESO (LOGIN)
══════════════════════════════════════════════════════ */
async function login() {
    const userKey = document.getElementById('userSelect').value;
    const passInput = document.getElementById('passInput').value;
    const userData = USERS_DB[userKey];

    if (userData && passInput === userData.pass) {
        currentUserRole = userData.role;
        
        // Transición de UI
        document.querySelector('.login-wrap').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        
        // Personalizar Interfaz
        document.getElementById('userNameDisplay').innerText = `Hola, ${userKey.charAt(0).toUpperCase() + userKey.slice(1)}`;
        configurarInterfazPorRol(userData.role);
        
        // Cargar datos iniciales
        cargarDatos();
    } else {
        alert("Contraseña incorrecta para el usuario seleccionado.");
        document.getElementById('passInput').value = "";
    }
}

function configurarInterfazPorRol(rol) {
    const badge = document.getElementById('userRoleBadge');
    if(badge) badge.innerText = rol.toUpperCase();
    
    // Ocultar pestaña Admin si no corresponde
    const tabAdmin = document.querySelector('[data-tab="tab-admin"]');
    if (rol !== 'admin' && tabAdmin) tabAdmin.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════
   3. GESTIÓN DE DATOS (CRUD)
══════════════════════════════════════════════════════ */
async function guardarPieza() {
    const btn = document.querySelector('.btn-register');
    
    const datos = {
        nombre_pieza: document.getElementById('nombrePieza').value,
        codigo: document.getElementById('codigoPieza').value,
        n_factura: document.getElementById('nFactura').value,
        estado_pieza: document.getElementById('estadoPieza').value,
        cantidad: parseInt(document.getElementById('cantidadPieza').value) || 0,
        tipo_precio: document.getElementById('tipoPrecio').value,
        monto: parseFloat(document.getElementById('montoPieza').value) || 0,
        descripcion: document.getElementById('descripcionPieza').value,
        estado_pago: 'pendiente', // Rojo por defecto
        fecha: new Date().toISOString()
    };

    if (!datos.nombre_pieza || isNaN(datos.monto)) {
        alert("Completa el nombre y el monto mínimo.");
        return;
    }

    try {
        btn.disabled = true;
        btn.innerText = "Guardando...";

        const { error } = await sb.from('inventario').insert([datos]);
        if (error) throw error;

        alert("¡Pieza registrada correctamente!");
        limpiarFormulario();
        switchTab('tab-historial');
    } catch (err) {
        alert("Error al guardar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Registrar Pieza";
    }
}

async function cargarDatos() {
    const container = document.getElementById('listaRegistros');
    container.innerHTML = '<div class="lista-empty">Sincronizando con Supabase...</div>';

    try {
        const { data, error } = await sb
            .from('inventario')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) throw error;
        registrosGlobales = data;
        renderizarLista(data);
    } catch (err) {
        container.innerHTML = `<div class="lista-empty">Error de conexión: ${err.message}</div>`;
    }
}

/* ══════════════════════════════════════════════════════
   4. INTERFAZ Y NAVEGACIÓN
══════════════════════════════════════════════════════ */
function renderizarLista(items) {
    const container = document.getElementById('listaRegistros');
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="lista-empty">No hay registros aún.</div>';
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
            ${renderBotonesAccion(item)}
        </div>
    `).join('');
}

function renderBotonesAccion(item) {
    // Si el usuario es de "Carga", no puede modificar estados
    if (currentUserRole === 'carga') return '';

    if (item.estado_pago === 'pendiente') {
        return `<div class="rc-acciones">
            <button class="btn-accion aprobar" onclick="cambiarEstado('${item.id}', 'aprobado')">Habilitar Pago</button>
        </div>`;
    } else if (item.estado_pago === 'aprobado' && (currentUserRole === 'oficina' || currentUserRole === 'admin')) {
        return `<div class="rc-acciones">
            <button class="btn-accion pagar" onclick="cambiarEstado('${item.id}', 'pagado')">Confirmar Pago</button>
        </div>`;
    }
    return '';
}

async function cambiarEstado(id, nuevoEstado) {
    try {
        const { error } = await sb.from('inventario').update({ estado_pago: nuevoEstado }).eq('id', id);
        if (error) throw error;
        cargarDatos(); // Recargar lista
    } catch (err) {
        alert("Error al actualizar estado: " + err.message);
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');

    if (tabId === 'tab-historial') cargarDatos();
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

function limpiarFormulario() {
    document.querySelectorAll('.field input, .field textarea').forEach(i => i.value = '');
}

/* ══════════════════════════════════════════════════════
   5. INICIALIZACIÓN Y EXPOSICIÓN GLOBAL
══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.classList.add('hidden');
    }, 1000);
});

// Exponer funciones al HTML
window.login = login;
window.switchTab = switchTab;
window.guardarPieza = guardarPieza;
window.cambiarEstado = cambiarEstado;
window.filtrar = filtrar;
window.logout = () => location.reload();
