/* Salven el Millón — Hackathon Edition
   Frontend estático con persistencia en Supabase y cola offline en localStorage. */

const STORAGE_KEY = 'sem_participantes';
const ROTACION_KEY = 'sem_rotacion';

const estado = {
  config: null,
  niveles: [],
  jugador: null,
  nivelIdx: 0,
  preguntaIdx: 0,
  puntosAsegurados: 0,
  puntosNivel: 0,
  vidas: 0,
  timerId: null,
  segundosRestantes: 0,
  respondiendo: false,
  respuestas: [],
  participantesAdmin: [],
  adminPin: '',
};

/* ---------- utilidades ---------- */

const $ = (id) => document.getElementById(id);

function mostrarPantalla(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

function mezclar(array) {
  const copia = array.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function premioPara(puntos) {
  const premios = estado.config.premios.slice().sort((a, b) => a.puntos - b.puntos);
  let elegido = premios[0];
  for (const p of premios) if (puntos >= p.puntos) elegido = p;
  return elegido?.premio || 'A definir en el evento';
}

function crearId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function supabaseDisponible() {
  const config = window.SUPABASE_CONFIG;
  const key = config?.publishableKey || config?.anonKey;
  return Boolean(config?.url && key && !String(config.url).includes('TU-PROYECTO'));
}

async function pedirASupabase(ruta, opciones = {}) {
  if (!supabaseDisponible()) throw new Error('Supabase no está configurado.');
  const config = window.SUPABASE_CONFIG;
  const key = config.publishableKey || config.anonKey;
  const respuesta = await fetch(`${config.url.replace(/\/$/, '')}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });
  if (!respuesta.ok) {
    let detalle = '';
    try {
      const error = await respuesta.json();
      detalle = error.message || error.hint || '';
    } catch { /* la respuesta puede no ser JSON */ }
    throw new Error(detalle || `Supabase respondió ${respuesta.status}.`);
  }
  if (respuesta.status === 204) return null;
  const texto = await respuesta.text();
  return texto ? JSON.parse(texto) : null;
}

/* ---------- animaciones ---------- */

const COLORES_CONFETI = ['#ffec6b', '#d7f3d2', '#c5f0ff', '#ffd9df', '#d9d2ff', '#ffffff'];

function lanzarConfeti(cantidad = 40) {
  const capa = $('confeti');
  for (let i = 0; i < cantidad; i++) {
    const papelito = document.createElement('span');
    papelito.className = 'papelito';
    papelito.style.left = Math.random() * 100 + 'vw';
    papelito.style.background = COLORES_CONFETI[i % COLORES_CONFETI.length];
    papelito.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    papelito.style.animationDelay = Math.random() * 0.4 + 's';
    papelito.style.transform = `rotate(${Math.random() * 360}deg)`;
    capa.appendChild(papelito);
    setTimeout(() => papelito.remove(), 4200);
  }
}

function animarNumero(elemento, desde, hasta, duracion = 700) {
  const inicio = performance.now();
  function paso(ahora) {
    const avance = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - avance, 3);
    elemento.textContent = Math.round(desde + (hasta - desde) * suave);
    if (avance < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

function rebotar(elemento, clase = 'pop') {
  elemento.classList.remove(clase);
  void elemento.offsetWidth;
  elemento.classList.add(clase);
}

function leerParticipantes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function escribirParticipantes(lista) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
}

function registroParaSupabase(registro) {
  return {
    client_id: registro.clientId,
    nombre: registro.nombre,
    apellido: registro.apellido,
    email: registro.email,
    edad: registro.edad ?? null,
    departamento: registro.departamento || null,
    puntos: registro.puntos,
    premio: registro.premio,
    nivel_alcanzado: registro.nivelAlcanzado,
    se_retiro: registro.seRetiro,
    fecha: registro.fecha,
    respuestas: registro.respuestas || [],
  };
}

function normalizarPartida(registro) {
  if ('nivelAlcanzado' in registro) return registro;
  return {
    clientId: registro.client_id,
    nombre: registro.nombre,
    apellido: registro.apellido,
    email: registro.email,
    edad: registro.edad,
    departamento: registro.departamento,
    puntos: registro.puntos,
    premio: registro.premio,
    nivelAlcanzado: registro.nivel_alcanzado,
    seRetiro: registro.se_retiro,
    fecha: registro.fecha,
    respuestas: registro.respuestas || [],
  };
}

async function sincronizarPendientes() {
  if (!supabaseDisponible()) return;
  let pendientes = leerParticipantes();
  let agregoIds = false;
  pendientes.forEach((registro) => {
    if (!registro.clientId) {
      registro.clientId = crearId();
      agregoIds = true;
    }
  });
  if (agregoIds) escribirParticipantes(pendientes);
  while (pendientes.length) {
    const lote = pendientes.slice(0, 100);
    await pedirASupabase('rpc/registrar_partidas', {
      method: 'POST',
      body: JSON.stringify({ p_partidas: lote.map(registroParaSupabase) }),
    });
    const idsGuardados = new Set(lote.map((p) => p.clientId));
    pendientes = leerParticipantes().filter((p) => !idsGuardados.has(p.clientId));
    escribirParticipantes(pendientes);
  }
}

function guardarParticipante(registro) {
  const lista = leerParticipantes();
  lista.push(registro);
  try {
    escribirParticipantes(lista);
    sincronizarPendientes().catch(() => {
      // La partida queda en la cola local y se reintenta al volver a abrir la app.
    });
  } catch {
    alert(
      'No queda espacio para guardar la partida en esta tablet. ' +
      'Revisá la conexión a internet y exportá los datos desde el panel.'
    );
  }
}

/* ---------- carga de datos ---------- */

async function cargarDatos() {
  try {
    const [config, preguntas] = await Promise.all([
      fetch('data/config.json').then((r) => r.json()),
      fetch('data/preguntas.json').then((r) => r.json()),
    ]);
    return { config, preguntas };
  } catch {
    // fetch no funciona al abrir el archivo con doble clic (file://): usamos la copia embebida.
    if (window.DATOS_OFFLINE) return window.DATOS_OFFLINE;
    throw new Error('No se pudieron cargar los datos del juego.');
  }
}

/* ---------- registro ---------- */

function iniciarRegistro(evento) {
  evento.preventDefault();
  const nombre = $('in-nombre').value.trim();
  const apellido = $('in-apellido').value.trim();
  const email = $('in-email').value.trim().toLowerCase();
  const edad = Number($('in-edad').value);
  const departamento = $('in-departamento').value;
  const error = $('error-registro');

  if (!nombre || !apellido) {
    error.textContent = 'Completá nombre y apellido.';
    error.hidden = false;
    return;
  }
  if (!emailValido(email)) {
    error.textContent = 'Revisá el email, no parece válido.';
    error.hidden = false;
    return;
  }
  if (!Number.isInteger(edad) || edad < 10 || edad > 99) {
    error.textContent = 'Ingresá una edad válida (entre 10 y 99 años).';
    error.hidden = false;
    return;
  }
  if (!departamento) {
    error.textContent = 'Elegí tu departamento de Mendoza.';
    error.hidden = false;
    return;
  }
  error.hidden = true;

  estado.jugador = { nombre, apellido, email, edad, departamento };
  estado.respuestas = [];
  estado.nivelIdx = 0;
  estado.puntosAsegurados = 0;
  estado.puntosNivel = 0;
  prepararNivel();
}

/* ---------- flujo de niveles ---------- */

function cantidadDePreguntas(nivel) {
  return Math.min(nivel.preguntasPorRonda || nivel.preguntas.length, nivel.preguntas.length);
}

/* La tablet recuerda qué preguntas ya salieron: reparte todas las del nivel
   antes de volver a repetir alguna. */
function leerRotacion() {
  try {
    return JSON.parse(localStorage.getItem(ROTACION_KEY)) || {};
  } catch {
    return {};
  }
}

function tomarPreguntas(nivel) {
  const cantidad = cantidadDePreguntas(nivel);
  const rotacion = leerRotacion();
  let pendientes = Array.isArray(rotacion[nivel.id]) ? rotacion[nivel.id] : [];
  pendientes = pendientes.filter((i) => Number.isInteger(i) && i < nivel.preguntas.length);

  const elegidas = [];
  while (elegidas.length < cantidad) {
    if (!pendientes.length) {
      const yaUsadas = new Set(elegidas);
      pendientes = mezclar(nivel.preguntas.map((_, i) => i)).filter((i) => !yaUsadas.has(i));
    }
    elegidas.push(pendientes.shift());
  }

  rotacion[nivel.id] = pendientes;
  try {
    localStorage.setItem(ROTACION_KEY, JSON.stringify(rotacion));
  } catch { /* si no hay espacio, seguimos igual con el sorteo de esta partida */ }
  return mezclar(elegidas).map((i) => nivel.preguntas[i]);
}

function prepararNivel() {
  const nivel = estado.niveles[estado.nivelIdx];
  estado.preguntaIdx = 0;
  estado.puntosNivel = 0;
  estado.vidas = estado.config.vidas;
  estado.preguntasDelNivel = tomarPreguntas(nivel);

  const maximo = estado.preguntasDelNivel.length * nivel.puntosPorPregunta;
  $('nivel-nombre').textContent = nivel.nombre;
  $('nivel-detalle').textContent =
    `${estado.preguntasDelNivel.length} preguntas · ${nivel.puntosPorPregunta} puntos cada una · ` +
    `hasta ${maximo} puntos · ${estado.config.vidas} vidas`;
  $('nivel-asegurados').textContent = estado.puntosAsegurados;
  $('nivel-medalla').textContent = nivel.id;
  mostrarPantalla('screen-nivel');
}

function empezarNivel() {
  mostrarPantalla('screen-juego');
  mostrarPregunta();
}

function actualizarHud(animado = false) {
  const nivel = estado.niveles[estado.nivelIdx];
  const puntos = estado.puntosAsegurados + estado.puntosNivel;
  const elPuntos = $('hud-puntos');
  $('hud-nivel').textContent = nivel.id;
  $('hud-pregunta').textContent = `${estado.preguntaIdx + 1}/${estado.preguntasDelNivel.length}`;

  if (animado && Number(elPuntos.textContent) !== puntos) {
    animarNumero(elPuntos, Number(elPuntos.textContent) || 0, puntos);
    rebotar(elPuntos);
  } else {
    elPuntos.textContent = puntos;
  }
  $('hud-vidas').textContent = '♥'.repeat(estado.vidas) || '—';
}

function mostrarPregunta() {
  const pregunta = estado.preguntasDelNivel[estado.preguntaIdx];
  actualizarHud();

  $('feedback').hidden = true;
  $('btn-siguiente').classList.add('oculto');
  $('pregunta-texto').textContent = pregunta.pregunta;

  const opcionesMezcladas = mezclar(
    pregunta.opciones.map((texto, i) => ({ texto, esCorrecta: i === pregunta.correcta }))
  );
  const contenedor = $('opciones');
  contenedor.innerHTML = '';
  opcionesMezcladas.forEach((opcion, i) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'opcion';
    boton.innerHTML = `<span class="letra">${'ABC'[i]}</span><span>${opcion.texto}</span>`;
    boton.addEventListener('click', () => responder(boton, opcion.esCorrecta));
    contenedor.appendChild(boton);
  });

  estado.respondiendo = true;
  iniciarTemporizador();
}

function iniciarTemporizador() {
  detenerTemporizador();
  const total = estado.config.segundosPorPregunta;
  const wrap = $('timer-wrap');
  if (!estado.config.usarTemporizador) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  estado.segundosRestantes = total;
  pintarReloj(1, total);

  estado.timerId = setInterval(() => {
    estado.segundosRestantes -= 1;
    pintarReloj(Math.max(0, estado.segundosRestantes / total), estado.segundosRestantes);
    if (estado.segundosRestantes <= 0) responder(null, false, true);
  }, 1000);
}

const PERIMETRO_RELOJ = 2 * Math.PI * 52;

function pintarReloj(proporcion, segundos) {
  const aguja = $('timer-bar');
  const apurado = segundos <= 10;
  aguja.style.strokeDashoffset = PERIMETRO_RELOJ * (1 - proporcion);
  aguja.classList.toggle('low', apurado);
  $('timer-wrap').classList.toggle('apurado', apurado);
  $('timer-num').textContent = Math.max(0, segundos);
}

function detenerTemporizador() {
  if (estado.timerId) clearInterval(estado.timerId);
  estado.timerId = null;
}

function responder(boton, esCorrecta, seAcaboElTiempo = false) {
  if (!estado.respondiendo) return;
  estado.respondiendo = false;
  detenerTemporizador();

  const nivel = estado.niveles[estado.nivelIdx];
  const botones = Array.from(document.querySelectorAll('.opcion'));
  botones.forEach((b) => b.classList.add('bloqueada'));

  const feedback = $('feedback');
  if (esCorrecta) {
    boton.classList.add('correcta');
    estado.puntosNivel += nivel.puntosPorPregunta;
    feedback.textContent = `¡Correcto! +${nivel.puntosPorPregunta} puntos`;
    feedback.className = 'feedback ok';
  } else {
    if (boton) boton.classList.add('incorrecta');
    estado.vidas -= 1;
    feedback.textContent = seAcaboElTiempo
      ? `¡Se acabó el tiempo! Perdés una vida (te quedan ${estado.vidas})`
      : `Incorrecto. Perdés una vida (te quedan ${estado.vidas})`;
    feedback.className = 'feedback bad';
    // Marcamos la correcta para que se aprenda algo.
    const textoCorrecto = estado.preguntasDelNivel[estado.preguntaIdx].opciones[
      estado.preguntasDelNivel[estado.preguntaIdx].correcta
    ];
    botones.find((b) => b.textContent.includes(textoCorrecto))?.classList.add('correcta');
  }
  registrarRespuesta(esCorrecta, seAcaboElTiempo, boton);
  feedback.hidden = false;
  botones.forEach((b) => {
    if (!b.classList.contains('correcta') && !b.classList.contains('incorrecta')) b.classList.add('apagada');
  });
  if (esCorrecta) lanzarConfeti(14);
  else rebotar($('hud-vidas'), 'perdio');
  actualizarHud(true);

  const siguiente = $('btn-siguiente');
  if (estado.vidas <= 0) {
    siguiente.textContent = 'Ver resultado';
  } else if (estado.preguntaIdx === estado.preguntasDelNivel.length - 1) {
    siguiente.textContent = 'Terminar nivel';
  } else {
    siguiente.textContent = 'Siguiente pregunta';
  }
  siguiente.classList.remove('oculto');
}

function registrarRespuesta(esCorrecta, seAcaboElTiempo, boton) {
  const nivel = estado.niveles[estado.nivelIdx];
  const pregunta = estado.preguntasDelNivel[estado.preguntaIdx];
  const elegida = seAcaboElTiempo
    ? '(sin responder)'
    : boton.querySelectorAll('span')[1].textContent;
  estado.respuestas.push({
    nivel: nivel.id,
    numero: estado.preguntaIdx + 1,
    pregunta: pregunta.pregunta,
    respuestaElegida: elegida,
    respuestaCorrecta: pregunta.opciones[pregunta.correcta],
    acerto: esCorrecta ? 'si' : 'no',
    seAcaboElTiempo: seAcaboElTiempo ? 'si' : 'no',
    segundosUsados: estado.config.usarTemporizador
      ? estado.config.segundosPorPregunta - estado.segundosRestantes
      : '',
    puntos: esCorrecta ? nivel.puntosPorPregunta : 0,
  });
}

function siguientePaso() {
  if (estado.vidas <= 0) {
    terminarJuego(false);
    return;
  }
  if (estado.preguntaIdx < estado.preguntasDelNivel.length - 1) {
    estado.preguntaIdx += 1;
    mostrarPregunta();
    return;
  }
  // Nivel completado: los puntos del nivel quedan asegurados.
  estado.puntosAsegurados += estado.puntosNivel;
  estado.puntosNivel = 0;

  if (estado.nivelIdx === estado.niveles.length - 1) {
    terminarJuego(true);
    return;
  }
  mostrarDecision();
}

function mostrarDecision() {
  const siguienteNivel = estado.niveles[estado.nivelIdx + 1];
  const maximo = cantidadDePreguntas(siguienteNivel) * siguienteNivel.puntosPorPregunta;
  $('dec-siguiente-nivel').textContent = siguienteNivel.nombre.split(':')[0];
  $('dec-max').textContent = '+' + maximo;
  $('dec-asegurados').textContent = estado.puntosAsegurados;
  mostrarPantalla('screen-decision');
  animarNumero($('dec-puntos'), 0, estado.puntosAsegurados, 900);
  lanzarConfeti(30);
}

function seguirJugando() {
  estado.nivelIdx += 1;
  prepararNivel();
}

function terminarJuego(completoTodo) {
  detenerTemporizador();
  const puntos = estado.puntosAsegurados;
  const premio = premioPara(puntos);

  guardarParticipante({
    clientId: crearId(),
    nombre: estado.jugador.nombre,
    apellido: estado.jugador.apellido,
    email: estado.jugador.email,
    edad: estado.jugador.edad,
    departamento: estado.jugador.departamento,
    puntos,
    premio,
    nivelAlcanzado: estado.niveles[estado.nivelIdx].id,
    seRetiro: !completoTodo && estado.vidas > 0,
    fecha: new Date().toISOString(),
    respuestas: estado.respuestas,
  });

  const sinVidas = estado.vidas <= 0;
  $('final-emoji').textContent = completoTodo ? '🏆' : sinVidas ? '💥' : '🎁';
  $('final-titulo').textContent = completoTodo
    ? '¡Salvaste el millón!'
    : sinVidas
      ? 'Te quedaste sin vidas'
      : '¡Te plantaste a tiempo!';
  $('final-sub').textContent = completoTodo
    ? 'Completaste los tres niveles.'
    : sinVidas
      ? `Perdiste los puntos del ${estado.niveles[estado.nivelIdx].nombre.split(':')[0]}, pero conservás lo asegurado.`
      : 'Decisión inteligente: te llevás todo lo que sumaste.';
  $('final-condicion').textContent = estado.config.avisoSeguir || '';
  $('final-condicion').hidden = !estado.config.avisoSeguir;
  mostrarPantalla('screen-final');
  animarNumero($('final-puntos'), 0, puntos, 1200);
  if (puntos > 0) lanzarConfeti(completoTodo ? 120 : 60);
}

function nuevoJugador() {
  $('form-registro').reset();
  estado.jugador = null;
  mostrarPantalla('screen-registro');
  $('in-nombre').focus();
}

/* ---------- panel de organización ---------- */

function abrirAdmin() {
  $('admin-login').hidden = false;
  $('admin-panel').hidden = true;
  $('in-pin').value = '';
  $('error-pin').hidden = true;
  mostrarPantalla('screen-admin');
}

async function cargarPartidasAdmin(pin) {
  if (!supabaseDisponible()) return leerParticipantes();
  await sincronizarPendientes();
  const limite = 1000;
  let offset = 0;
  const partidas = [];
  while (true) {
    const lote = await pedirASupabase('rpc/admin_listar_partidas', {
      method: 'POST',
      body: JSON.stringify({ p_pin: pin, p_offset: offset, p_limit: limite }),
    });
    partidas.push(...(lote || []).map(normalizarPartida));
    if (!lote || lote.length < limite) break;
    offset += limite;
  }
  return [...new Map(partidas.map((partida) => [partida.clientId, partida])).values()];
}

async function validarPin() {
  const pin = $('in-pin').value.trim();
  const error = $('error-pin');
  const boton = $('btn-pin');
  error.hidden = true;

  if (!supabaseDisponible() && pin !== String(estado.config.pinAdminLocal || estado.config.pinAdmin)) {
    error.textContent = 'PIN incorrecto';
    error.hidden = false;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Cargando…';
  try {
    estado.participantesAdmin = await cargarPartidasAdmin(pin);
    estado.adminPin = pin;
    $('admin-login').hidden = true;
    $('admin-panel').hidden = false;
    renderTabla();
  } catch {
    error.textContent = 'PIN incorrecto o no se pudo conectar con Supabase.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
}

function renderTabla() {
  const lista = estado.participantesAdmin
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const cuerpo = document.querySelector('#tabla-participantes tbody');
  cuerpo.innerHTML = '';
  lista.slice(0, 250).forEach((p) => {
    const fila = document.createElement('tr');
    const fecha = new Date(p.fecha);
    [
      `${p.nombre} ${p.apellido}`,
      p.email,
      p.edad ?? '—',
      p.departamento || '—',
      p.puntos,
      p.premio,
      fecha.toLocaleString('es-AR'),
    ].forEach((valor) => {
      const celda = document.createElement('td');
      celda.textContent = valor;
      fila.appendChild(celda);
    });
    cuerpo.appendChild(fila);
  });
  const total = lista.reduce((suma, p) => suma + p.puntos, 0);
  $('admin-resumen').textContent =
    `${lista.length} ${lista.length === 1 ? 'participante' : 'participantes'} · ${total} puntos otorgados` +
    (lista.length > 250 ? ' · mostrando las 250 partidas más recientes' : '');
  renderMetricas(lista);
}

function renderMetricas(lista) {
  const respuestas = lista.flatMap((p) => p.respuestas || []);
  const aciertos = respuestas.filter((r) => r.acerto === 'si').length;
  const porcentaje = respuestas.length ? Math.round((aciertos / respuestas.length) * 100) : 0;
  const sePlantaron = lista.filter((p) => p.seRetiro).length;
  $('admin-metricas').textContent = respuestas.length
    ? `${respuestas.length} respuestas registradas · ${porcentaje}% de aciertos · ${sePlantaron} se plantaron`
    : 'Todavía no hay respuestas registradas.';

  const kb = Math.round(new Blob([localStorage.getItem(STORAGE_KEY) || '']).size / 1024);
  const alerta = $('admin-alerta');
  if (!supabaseDisponible()) {
    alerta.textContent = `Modo local: hay ${kb} KB guardados solamente en este dispositivo.`;
    alerta.hidden = false;
  } else if (kb > 0) {
    alerta.textContent =
      `Hay ${kb} KB en la cola offline pendientes de sincronizar con Supabase.`;
    alerta.hidden = false;
  } else {
    alerta.hidden = true;
  }
}

function calcularInforme(lista) {
  const edades = lista.map((p) => Number(p.edad)).filter((edad) => Number.isFinite(edad) && edad > 0);
  const edadPromedio = edades.length
    ? edades.reduce((suma, edad) => suma + edad, 0) / edades.length
    : 0;
  const departamentos = new Map();
  const premios = new Map();
  const niveles = new Map();
  const resultados = new Map();
  const preguntas = new Map();
  const rangosEdad = [
    ['10 a 17', 10, 17], ['18 a 24', 18, 24], ['25 a 34', 25, 34],
    ['35 a 44', 35, 44], ['45 a 54', 45, 54], ['55 o más', 55, Infinity],
  ].map(([nombre, desde, hasta]) => ({ nombre, desde, hasta, cantidad: 0 }));
  const preguntasEsperadas = estado.niveles.reduce((total, nivel) => total + cantidadDePreguntas(nivel), 0);

  lista.forEach((participante) => {
    const departamento = participante.departamento || 'Sin dato';
    departamentos.set(departamento, (departamentos.get(departamento) || 0) + 1);
    const premio = participante.premio || 'Sin dato';
    premios.set(premio, (premios.get(premio) || 0) + 1);
    const nivel = `Nivel ${participante.nivelAlcanzado || 'sin dato'}`;
    niveles.set(nivel, (niveles.get(nivel) || 0) + 1);
    const resultado = resultadoPartida(participante, preguntasEsperadas);
    resultados.set(resultado, (resultados.get(resultado) || 0) + 1);
    const edad = Number(participante.edad);
    const rangoEdad = rangosEdad.find((rango) => edad >= rango.desde && edad <= rango.hasta);
    if (rangoEdad) rangoEdad.cantidad += 1;
    (participante.respuestas || []).forEach((respuesta) => {
      if (!preguntas.has(respuesta.pregunta)) {
        preguntas.set(respuesta.pregunta, {
          nivel: respuesta.nivel,
          pregunta: respuesta.pregunta,
          correcta: respuesta.respuestaCorrecta,
          total: 0,
          aciertos: 0,
          elegidas: new Map(),
        });
      }
      const item = preguntas.get(respuesta.pregunta);
      item.total += 1;
      if (respuesta.acerto === 'si') item.aciertos += 1;
      const elegida = respuesta.respuestaElegida || '(sin responder)';
      item.elegidas.set(elegida, (item.elegidas.get(elegida) || 0) + 1);
    });
  });

  const totalRespuestas = [...preguntas.values()].reduce((suma, pregunta) => suma + pregunta.total, 0);
  const totalAciertos = [...preguntas.values()].reduce((suma, pregunta) => suma + pregunta.aciertos, 0);
  const puntosTotales = lista.reduce((suma, participante) => suma + Number(participante.puntos || 0), 0);

  return {
    total: lista.length,
    edadPromedio,
    totalRespuestas,
    totalAciertos,
    porcentajeAciertos: totalRespuestas ? (totalAciertos / totalRespuestas) * 100 : 0,
    puntosTotales,
    puntosPromedio: lista.length ? puntosTotales / lista.length : 0,
    departamentos: [...departamentos.entries()].sort((a, b) => b[1] - a[1]),
    edades: rangosEdad.map((rango) => [rango.nombre, rango.cantidad]),
    premios: [...premios.entries()].sort((a, b) => b[1] - a[1]),
    niveles: [...niveles.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')),
    resultados: [...resultados.entries()].sort((a, b) => b[1] - a[1]),
    preguntas: [...preguntas.values()].sort((a, b) =>
      Number(a.nivel) - Number(b.nivel) || a.pregunta.localeCompare(b.pregunta, 'es')
    ),
  };
}

function resultadoPartida(participante, preguntasEsperadas) {
  if (participante.seRetiro) return 'Se plantó';
  const respuestas = participante.respuestas || [];
  if (respuestas.length >= preguntasEsperadas && respuestas.at(-1)?.acerto === 'si') {
    return 'Completó el juego';
  }
  return 'Se quedó sin vidas';
}

function resumenRespuestas(pregunta) {
  return [...pregunta.elegidas.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([respuesta, cantidad]) => `${respuesta}: ${cantidad}`)
    .join(' · ');
}

function crearGraficoBarras(items, titulo, color = '#f1cf22') {
  const ancho = 1200;
  const alto = Math.max(430, 100 + items.length * 45);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = '#1d1d1f';
  ctx.font = 'bold 34px Arial';
  ctx.fillText(titulo, 45, 52);
  const maximo = Math.max(1, ...items.map(([, cantidad]) => cantidad));
  items.forEach(([nombre, cantidad], indice) => {
    const y = 92 + indice * 45;
    ctx.fillStyle = '#333338';
    ctx.font = '22px Arial';
    ctx.fillText(String(nombre).slice(0, 30), 45, y + 22);
    ctx.fillStyle = '#ececef';
    ctx.fillRect(360, y, 720, 27);
    ctx.fillStyle = color;
    ctx.fillRect(360, y, Math.max(3, (cantidad / maximo) * 720), 27);
    ctx.fillStyle = '#1d1d1f';
    ctx.font = 'bold 21px Arial';
    ctx.fillText(String(cantidad), 1100, y + 22);
  });
  return canvas.toDataURL('image/png');
}

function crearGraficoTorta(items, titulo) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 650;
  const ctx = canvas.getContext('2d');
  const colores = ['#f1cf22', '#ff6b6b', '#42b883', '#537fe7', '#a66cff', '#ff9f43', '#5f6c7b'];
  const total = items.reduce((suma, [, cantidad]) => suma + cantidad, 0) || 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1d1d1f';
  ctx.font = 'bold 34px Arial';
  ctx.fillText(titulo, 45, 52);
  let angulo = -Math.PI / 2;
  items.forEach(([, cantidad], indice) => {
    const siguiente = angulo + (cantidad / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(330, 340);
    ctx.arc(330, 340, 220, angulo, siguiente);
    ctx.closePath();
    ctx.fillStyle = colores[indice % colores.length];
    ctx.fill();
    angulo = siguiente;
  });
  items.forEach(([nombre, cantidad], indice) => {
    const y = 130 + indice * 62;
    ctx.fillStyle = colores[indice % colores.length];
    ctx.fillRect(620, y, 30, 30);
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '21px Arial';
    ctx.fillText(`${String(nombre).slice(0, 32)}: ${cantidad} (${((cantidad / total) * 100).toFixed(1)}%)`, 670, y + 24);
  });
  return canvas.toDataURL('image/png');
}

function agregarTituloPdf(doc, titulo, subtitulo = '') {
  doc.setTextColor(29, 29, 31);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text(titulo, 14, 18);
  if (subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 105);
    doc.text(subtitulo, 14, 24);
  }
}

function dibujarKpis(doc, informe) {
  const kpis = [
    ['Participantes', informe.total],
    ['Edad promedio', informe.edadPromedio ? informe.edadPromedio.toFixed(1) : '—'],
    ['Respuestas', informe.totalRespuestas],
    ['Aciertos', `${informe.porcentajeAciertos.toFixed(1)}%`],
    ['Puntos promedio', informe.puntosPromedio.toFixed(0)],
    ['Puntos otorgados', informe.puntosTotales],
  ];
  kpis.forEach(([etiqueta, valor], indice) => {
    const columna = indice % 3;
    const fila = Math.floor(indice / 3);
    const x = 14 + columna * 62;
    const y = 37 + fila * 30;
    doc.setFillColor(245, 245, 247);
    doc.roundedRect(x, y, 56, 24, 3, 3, 'F');
    doc.setTextColor(29, 29, 31);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(valor), x + 4, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 105);
    doc.text(etiqueta, x + 4, y + 18);
  });
}

function opcionesPdf() {
  return {
    theme: 'grid',
    margin: { left: 10, right: 10 },
    styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [29, 29, 31], textColor: [255, 236, 107], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 249] },
  };
}

async function descargarPdf() {
  if (!estado.participantesAdmin.length) {
    alert('Todavía no hay participantes para incluir en el informe.');
    return;
  }
  const boton = $('btn-pdf');
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando PDF…';
  await new Promise((resolver) => setTimeout(resolver, 30));
  try {
    if (!window.jspdf?.jsPDF) throw new Error('No se cargó el generador de PDF.');
    const informe = calcularInforme(estado.participantesAdmin);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    agregarTituloPdf(doc, 'Salven el Millón — Informe general', `Generado el ${new Date().toLocaleString('es-AR')} · Incluye todas las partidas`);
    dibujarKpis(doc, informe);
    doc.addImage(crearGraficoBarras(informe.resultados, 'Resultado de las partidas', '#42b883'), 'PNG', 14, 102, 182, 78);
    doc.addImage(crearGraficoTorta(informe.premios, 'Premios obtenidos'), 'PNG', 14, 187, 182, 98);

    doc.addPage();
    agregarTituloPdf(doc, 'Distribución geográfica', 'Participantes por departamento de Mendoza');
    doc.addImage(crearGraficoBarras(informe.departamentos, 'Participantes por departamento'), 'PNG', 10, 31, 190, 238);

    doc.addPage();
    agregarTituloPdf(doc, 'Distribución por edad');
    doc.addImage(crearGraficoBarras(informe.edades, 'Participantes por rango de edad', '#537fe7'), 'PNG', 14, 32, 182, 105);
    doc.addImage(crearGraficoBarras(informe.niveles, 'Nivel alcanzado', '#a66cff'), 'PNG', 14, 151, 182, 92);

    doc.addPage();
    agregarTituloPdf(doc, 'Preguntas y respuestas', 'Rendimiento agregado de todas las personas');
    doc.autoTable({
      ...opcionesPdf(),
      startY: 30,
      head: [['Nivel', 'Pregunta', 'Correcta', 'Respuestas elegidas', 'Aciertos']],
      body: informe.preguntas.map((pregunta) => [
        pregunta.nivel,
        pregunta.pregunta,
        pregunta.correcta,
        resumenRespuestas(pregunta),
        `${pregunta.aciertos}/${pregunta.total} (${pregunta.total ? ((pregunta.aciertos / pregunta.total) * 100).toFixed(1) : 0}%)`,
      ]),
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 57 }, 2: { cellWidth: 42 }, 3: { cellWidth: 57 }, 4: { cellWidth: 22 } },
    });

    doc.addPage();
    agregarTituloPdf(doc, 'Participantes', 'Datos completos de todas las partidas registradas');
    const preguntasEsperadas = estado.niveles.reduce((total, nivel) => total + cantidadDePreguntas(nivel), 0);
    doc.autoTable({
      ...opcionesPdf(),
      startY: 30,
      head: [['Nombre', 'Apellido', 'Email', 'Edad', 'Departamento', 'Puntos', 'Premio', 'Nivel', 'Resultado', 'Fecha']],
      body: estado.participantesAdmin.map((p) => [
        p.nombre, p.apellido, p.email, p.edad ?? '', p.departamento || '', p.puntos,
        p.premio, p.nivelAlcanzado, resultadoPartida(p, preguntasEsperadas),
        new Date(p.fecha).toLocaleString('es-AR'),
      ]),
      styles: { font: 'helvetica', fontSize: 5.5, cellPadding: 1.3, overflow: 'linebreak' },
      columnStyles: { 2: { cellWidth: 35 }, 4: { cellWidth: 22 }, 6: { cellWidth: 29 }, 8: { cellWidth: 22 }, 9: { cellWidth: 25 } },
    });

    const paginas = doc.getNumberOfPages();
    for (let pagina = 1; pagina <= paginas; pagina++) {
      doc.setPage(pagina);
      doc.setFontSize(7);
      doc.setTextColor(125, 125, 130);
      doc.text(`CuyoConnect · Página ${pagina} de ${paginas}`, 196, 291, { align: 'right' });
    }
    doc.save(`informe-salven-el-millon-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (error) {
    console.error(error);
    alert('No se pudo generar el PDF. Recargá la página e intentá de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function crearHoja(datos, anchos) {
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  hoja['!cols'] = anchos.map((wch) => ({ wch }));
  return hoja;
}

async function descargarExcel() {
  if (!estado.participantesAdmin.length) {
    alert('Todavía no hay participantes para incluir en el Excel.');
    return;
  }
  const boton = $('btn-excel');
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Generando Excel…';
  await new Promise((resolver) => setTimeout(resolver, 30));
  try {
    if (!window.XLSX) throw new Error('No se cargó el generador de Excel.');
    const informe = calcularInforme(estado.participantesAdmin);
    const libro = XLSX.utils.book_new();
    const preguntasEsperadas = estado.niveles.reduce((total, nivel) => total + cantidadDePreguntas(nivel), 0);
    const resumen = [
      ['SALVEN EL MILLÓN — INFORME GENERAL'],
      ['Generado', new Date().toLocaleString('es-AR')],
      [],
      ['Indicador', 'Valor'],
      ['Participantes', informe.total],
      ['Edad promedio', Number(informe.edadPromedio.toFixed(1))],
      ['Respuestas', informe.totalRespuestas],
      ['Aciertos', informe.totalAciertos],
      ['Porcentaje de aciertos', `${informe.porcentajeAciertos.toFixed(1)}%`],
      ['Puntos promedio', Number(informe.puntosPromedio.toFixed(1))],
      ['Puntos otorgados', informe.puntosTotales],
      [], ['PARTICIPANTES POR DEPARTAMENTO'], ['Departamento', 'Cantidad', 'Porcentaje'],
      ...informe.departamentos.map(([nombre, cantidad]) => [nombre, cantidad, `${((cantidad / informe.total) * 100).toFixed(1)}%`]),
      [], ['RANGOS DE EDAD'], ['Rango', 'Cantidad'], ...informe.edades,
      [], ['PREMIOS'], ['Premio', 'Cantidad'], ...informe.premios,
      [], ['RESULTADOS'], ['Resultado', 'Cantidad'], ...informe.resultados,
    ];
    XLSX.utils.book_append_sheet(libro, crearHoja(resumen, [38, 18, 18]), 'Resumen');

    const participantes = [[
      'Nombre', 'Apellido', 'Email', 'Edad', 'Departamento', 'Puntos', 'Premio',
      'Nivel alcanzado', 'Resultado', 'Fecha', 'ID de partida',
    ], ...estado.participantesAdmin.map((p) => [
      p.nombre, p.apellido, p.email, p.edad ?? '', p.departamento || '', p.puntos,
      p.premio, p.nivelAlcanzado, resultadoPartida(p, preguntasEsperadas),
      new Date(p.fecha).toLocaleString('es-AR'), p.clientId || '',
    ])];
    XLSX.utils.book_append_sheet(libro, crearHoja(participantes, [18, 18, 32, 8, 20, 10, 32, 14, 22, 21, 38]), 'Participantes');

    const respuestas = [[
      'Nombre', 'Apellido', 'Email', 'Edad', 'Departamento', 'Fecha', 'Nivel', 'N.º',
      'Pregunta', 'Respuesta elegida', 'Respuesta correcta', 'Resultado', 'Tiempo agotado',
      'Segundos usados', 'Puntos', 'ID de partida',
    ]];
    estado.participantesAdmin.forEach((p) => {
      (p.respuestas || []).forEach((r) => respuestas.push([
        p.nombre, p.apellido, p.email, p.edad ?? '', p.departamento || '',
        new Date(p.fecha).toLocaleString('es-AR'), r.nivel, r.numero, r.pregunta,
        r.respuestaElegida, r.respuestaCorrecta, r.acerto === 'si' ? 'Correcta' : 'Incorrecta',
        r.seAcaboElTiempo === 'si' ? 'Sí' : 'No', r.segundosUsados, r.puntos, p.clientId || '',
      ]));
    });
    XLSX.utils.book_append_sheet(libro, crearHoja(respuestas, [18, 18, 30, 8, 20, 21, 8, 7, 55, 38, 38, 12, 14, 15, 9, 38]), 'Respuestas');

    const preguntas = [[
      'Nivel', 'Pregunta', 'Respuesta correcta', 'Total de respuestas', 'Aciertos',
      'Errores', 'Porcentaje de aciertos', 'Distribución de respuestas',
    ], ...informe.preguntas.map((p) => [
      p.nivel, p.pregunta, p.correcta, p.total, p.aciertos, p.total - p.aciertos,
      `${(p.total ? (p.aciertos / p.total) * 100 : 0).toFixed(1)}%`, resumenRespuestas(p),
    ])];
    XLSX.utils.book_append_sheet(libro, crearHoja(preguntas, [8, 58, 40, 18, 10, 10, 22, 65]), 'Preguntas');
    XLSX.writeFile(libro, `informe-salven-el-millon-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  } catch (error) {
    console.error(error);
    alert('No se pudo generar el Excel. Recargá la página e intentá de nuevo.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

async function borrarDatos() {
  const ubicacion = supabaseDisponible() ? 'Supabase' : 'esta tablet';
  if (!confirm(`¿Borrar definitivamente todos los participantes guardados en ${ubicacion}?`)) return;
  const boton = $('btn-borrar');
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Borrando…';
  try {
    let cantidad = estado.participantesAdmin.length;
    if (supabaseDisponible()) {
      cantidad = await pedirASupabase('rpc/admin_borrar_partidas', {
        method: 'POST',
        body: JSON.stringify({ p_pin: estado.adminPin }),
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ROTACION_KEY);
    estado.participantesAdmin = [];
    renderTabla();
    alert(`${cantidad || 0} ${cantidad === 1 ? 'participante borrado' : 'participantes borrados'}.`);
  } catch (error) {
    console.error(error);
    alert(`No se pudieron borrar los datos: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

/* ---------- arranque ---------- */

async function init() {
  const datos = await cargarDatos();
  estado.config = datos.config;
  estado.niveles = datos.preguntas.niveles;

  document.title = `${estado.config.titulo} — ${estado.config.subtitulo}`;
  $('titulo-juego').textContent = estado.config.titulo;
  $('subtitulo-juego').textContent = estado.config.subtitulo;
  $('aviso-seguir').textContent = estado.config.avisoSeguir || '';
  $('aviso-seguir').hidden = !estado.config.avisoSeguir;
  if (estado.config.instagramUrl) {
    $('instagram-link').href = estado.config.instagramUrl;
    $('instagram-link-decision').href = estado.config.instagramUrl;
  }

  $('form-registro').addEventListener('submit', iniciarRegistro);
  $('btn-empezar-nivel').addEventListener('click', empezarNivel);
  $('btn-siguiente').addEventListener('click', siguientePaso);
  $('btn-plantarse').addEventListener('click', () => terminarJuego(false));
  $('btn-seguir').addEventListener('click', seguirJugando);
  $('btn-nuevo-jugador').addEventListener('click', nuevoJugador);
  $('btn-abrir-admin').addEventListener('click', abrirAdmin);
  $('btn-pin').addEventListener('click', validarPin);
  $('in-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') validarPin(); });
  $('btn-salir-admin').addEventListener('click', () => mostrarPantalla('screen-registro'));
  $('btn-salir-admin-2').addEventListener('click', () => mostrarPantalla('screen-registro'));
  $('btn-pdf').addEventListener('click', descargarPdf);
  $('btn-excel').addEventListener('click', descargarExcel);
  $('btn-borrar').addEventListener('click', borrarDatos);

  sincronizarPendientes().catch(() => {
    // Sin conexión: la cola local se conserva para el próximo intento.
  });
}

init().catch((error) => {
  document.body.innerHTML =
    `<div style="padding:24px;font-family:sans-serif;color:#fff">No se pudo iniciar el juego: ${error.message}</div>`;
});
