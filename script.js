/* ══════════════════════════════════════════════════════
   1. CONFIGURACIÓN DE SUPABASE
══════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://oyvqrxaslamvedfowqdg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95dnFyeGFzbGFtdmVkZm93cWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTMyMzEsImV4cCI6MjA5MDcyOTIzMX0.kBIMpczUhcjKHzQBWm9zwVAYUHCZR_Z9agYfeuj5ADo';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── USUARIOS Y ROLES (RESTABLECIDO) ────────────────── */
const USERS_DB = {
    "guillermo": { pass: "guille2026", role: "carga" },
    "supervisor": { pass: "super123",  role: "supervisor" },
    "oficina":    { pass: "oficina77",  role: "oficina" },
    "admin":      { pass: "adminromero", role: "admin" }
};

let currentUserName = null;
let currentUserRole = null;
let registrosGlobales = [];

/* ══════════════════════════════════════════════════════
   2. ACCESO Y SEGURIDAD
══════════════════════════════════════════════════════ */
async function login() {
    const userKey = document.getElementById('userSelect').value;
    const passInput = document.getElementById('passInput').value;
    const userData = USERS_DB[userKey];

    if (userData && passInput === userData.pass) {
        currentUserName = userKey.charAt(0).toUpperCase() + userKey.slice(1);
        currentUserRole = userData.role;

        document.querySelector('.login-wrap').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        
        document.getElementById('userNameDisplay').innerText = `Hola, ${currentUserName}`;
        configurarInterfazPorRol(userData.role);
        cargarDatos();
    } else {
        alert("Contraseña incorrecta.");
    }
}

function configurarInterfazPorRol(rol) {
    const badge = document.getElementById('userRoleBadge');
    if(badge) {
        badge.innerText = rol.toUpperCase();
        if(rol === 'supervisor') badge.style.background = '#d4af37'; // Gold
    }
    
    const tabAdmin = document.querySelector('[data-tab="tab-admin"]');
    if ((rol !== 'admin' && rol !== 'supervisor') && tabAdmin) {
        tabAdmin.classList.add('hidden');
    }
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
        estado_pago: 'pendiente',
        fecha: new Date().toISOString()
    };

    try {
        btn.disabled = true;
        const { error } = await sb.from('inventario').insert([datos]);
        if (error) throw error;
        
        alert("Registrado correctamente.");
        limpiarFormulario();
        switchTab('tab-historial');
    } catch (err) {
        alert("Error al guardar: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

async function cargarDatos() {
    const container = document.getElementById('listaRegistros');
    container.innerHTML = '<div class="lista-empty">Sincronizando...</div>';

    try {
        const { data, error } = await sb.from('inventario').select('*').order('fecha', { ascending: false });
        if (error) throw error;
        registrosGlobales = data;
        renderizarLista(data);
    } catch (err) {
        container.innerHTML = `<div class="lista-empty">Error: ${err.message}</div>`;
    }
}

/* ══════════════════════════════════════════════════════
   4. RENDERIZADO E INTERACCIÓN
══════════════════════════════════════════════════════ */
function renderizarLista(items) {
    const container = document.getElementById('listaRegistros');
    if (items.length === 0) {
        container.innerHTML = '<div class="lista-empty">No hay registros.</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="registro-card estado-${item.estado_pago}">
            <div class="rc-top">
                <div class="rc-info">
                    <div class="rc-nombre">${item.nombre_pieza}</div>
                    <div class="rc-meta">Factura: ${item.n_factura} | Estado: ${item.estado_pieza}</div>
                </div>
                <div class="rc-right">
                    <div class="rc-total">$${item.monto.toLocaleString()}</div>
                    <span class="estado-pill ${item.estado_pago}">
                        <i class="pill-dot"></i> ${item.estado_pago.toUpperCase()}
                    </span>
                </div>
            </div>
            ${item.comentario ? `<div class="comentario-guardado"><strong>Obs:</strong> ${item.comentario}</div>` : ''}
            ${renderAcciones(item)}
        </div>
    `).join('');
}

function renderAcciones(item) {
    if (currentUserRole === 'carga') return '';
    let html = '<div class="rc-acciones">';
    
    if (item.estado_pago === 'pendiente' && (currentUserRole === 'supervisor' || currentUserRole === 'admin')) {
        html += `<button class="btn-accion aprobar" onclick="cambiarEstado('${item.id}', 'aprobado')">Habilitar Pago</button>`;
    } else if (item.estado_pago === 'aprobado' && (currentUserRole === 'oficina' || currentUserRole === 'admin')) {
        html += `<button class="btn-accion pagar" onclick="cambiarEstado('${item.id}', 'pagado')">Confirmar Pago</button>`;
    }

    if (currentUserRole === 'supervisor' || currentUserRole === 'admin') {
        html += `<textarea class="comentario-input" placeholder="Nota de revisión..." onblur="guardarComentario('${item.id}', this.value)"></textarea>`;
    }
    return html + '</div>';
}

async function cambiarEstado(id, nuevoEstado) {
    await sb.from('inventario').update({ estado_pago: nuevoEstado }).eq('id', id);
    cargarDatos();
}

async function guardarComentario(id, texto) {
    if(!texto.trim()) return;
    await sb.from('inventario').update({ comentario: texto }).eq('id', id);
    cargarDatos();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'tab-historial') cargarDatos();
}

function limpiarFormulario() {
    document.querySelectorAll('input, textarea').forEach(i => i.value = '');
}

// INICIALIZACIÓN
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const loader = document.getElementById('loadingOverlay');
        if (loader) loader.classList.add('hidden');
    }, 1500);
});

// EXPOSICIÓN GLOBAL
window.login = login;
window.switchTab = switchTab;
window.guardarPieza = guardarPieza;
window.cambiarEstado = cambiarEstado;
window.guardarComentario = guardarComentario;
window.logout = () => location.reload();
