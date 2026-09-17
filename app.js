/* Salven el Millón — Hackathon Edition
   Frontend puro. Los datos viven en /data/*.json
   (y en data/datos-offline.js como respaldo para abrir el juego con doble clic). */

const STORAGE_KEY = 'sem_participantes';

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
  return elegido.premio;
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

function guardarParticipante(registro) {
  const lista = leerParticipantes();
  lista.push(registro);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
  } catch {
    alert(
      'No queda espacio para guardar más partidas en esta tablet. ' +
      'Entrá al panel de organización, descargá los CSV y borrá los datos.'
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
  error.hidden = true;

  estado.jugador = { nombre, apellido, email };
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

function prepararNivel() {
  const nivel = estado.niveles[estado.nivelIdx];
  estado.preguntaIdx = 0;
  estado.puntosNivel = 0;
  estado.vidas = estado.config.vidas;
  estado.preguntasDelNivel = mezclar(nivel.preguntas).slice(0, cantidadDePreguntas(nivel));

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
  $('dec-premio').textContent = premioPara(estado.puntosAsegurados);
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
    nombre: estado.jugador.nombre,
    apellido: estado.jugador.apellido,
    email: estado.jugador.email,
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
  $('final-premio').textContent = premio;
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

function validarPin() {
  if ($('in-pin').value.trim() !== String(estado.config.pinAdmin)) {
    $('error-pin').hidden = false;
    return;
  }
  $('admin-login').hidden = true;
  $('admin-panel').hidden = false;
  renderTabla();
}

function renderTabla() {
  const lista = leerParticipantes().slice().reverse();
  const cuerpo = document.querySelector('#tabla-participantes tbody');
  cuerpo.innerHTML = '';
  lista.forEach((p) => {
    const fila = document.createElement('tr');
    const fecha = new Date(p.fecha);
    [
      `${p.nombre} ${p.apellido}`,
      p.email,
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
    `${lista.length} participantes · ${total} puntos otorgados en total`;
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
  if (kb > 3500) {
    alerta.textContent =
      `Los datos guardados ocupan ${kb} KB y el navegador permite ~5 MB. ` +
      'Descargá los CSV y borrá los datos para seguir registrando sin riesgo.';
    alerta.hidden = false;
  } else {
    alerta.hidden = true;
  }
}

function bajarCsv(nombreArchivo, encabezado, filas) {
  const escapar = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`;
  const cuerpo = filas.map((fila) => fila.map(escapar).join(','));
  const csv = '\uFEFF' + [encabezado.join(','), ...cuerpo].join('\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  enlace.download = `${nombreArchivo}-${new Date().toISOString().slice(0, 10)}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

function descargarCsv() {
  const campos = ['nombre', 'apellido', 'email', 'puntos', 'premio', 'nivelAlcanzado', 'seRetiro', 'fecha'];
  const filas = leerParticipantes().map((p) => campos.map((campo) => p[campo]));
  bajarCsv('participantes', campos, filas);
}

function descargarCsvRespuestas() {
  const campos = [
    'nivel', 'numero', 'pregunta', 'respuestaElegida', 'respuestaCorrecta',
    'acerto', 'seAcaboElTiempo', 'segundosUsados', 'puntos',
  ];
  const filas = leerParticipantes().flatMap((p) =>
    (p.respuestas || []).map((r) => [
      `${p.nombre} ${p.apellido}`, p.email, p.fecha,
      ...campos.map((campo) => r[campo]),
    ])
  );
  if (!filas.length) {
    alert('Todavía no hay respuestas registradas en esta tablet.');
    return;
  }
  bajarCsv('respuestas', ['jugador', 'email', 'fechaPartida', ...campos], filas);
}

function borrarDatos() {
  if (!confirm('¿Borrar todos los participantes guardados en esta tablet?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderTabla();
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
  $('btn-csv').addEventListener('click', descargarCsv);
  $('btn-csv-respuestas').addEventListener('click', descargarCsvRespuestas);
  $('btn-borrar').addEventListener('click', borrarDatos);
}

init().catch((error) => {
  document.body.innerHTML =
    `<div style="padding:24px;font-family:sans-serif;color:#fff">No se pudo iniciar el juego: ${error.message}</div>`;
});
