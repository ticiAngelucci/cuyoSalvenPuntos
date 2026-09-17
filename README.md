# Salven el Millón — Hackathon Edition

Juego de preguntas para stand (tablet o celular). **Solo frontend**: HTML, CSS y JavaScript, sin backend ni instalación.

Diseño inspirado en cuyoconnect.com: fondo claro, negro, amarillo resaltador y pasteles, con el logo de CuyoConnect en `assets/`.
Tipografías Anton + Sora desde Google Fonts (si la tablet está sin internet, usa las del sistema).

## Cómo usarlo

- **Opción simple**: abrir `index.html` con doble clic (funciona gracias a `data/datos-offline.js`).
- **Opción recomendada** (lee los JSON directamente): servir la carpeta y abrir la URL en la tablet.
  ```bash
  python3 -m http.server 8000
  ```
- En la tablet conviene "Agregar a pantalla de inicio" y usarlo en pantalla completa.

## Cómo se juega

1. El jugador carga **nombre, apellido y email**.
2. Tres niveles cortos: 4 preguntas de 100, 3 de 200 y 3 de 300 puntos (máximo 1900, 10 preguntas en total).
   Cada nivel tiene 10 preguntas cargadas y el juego sortea cuáles toca (`preguntasPorRonda` en `data/preguntas.json`).
3. **1 vida por nivel**. Un error o el tiempo agotado termina el nivel.
4. Al terminar un nivel, los puntos quedan **asegurados** y el jugador elige:
   - **Me planto y canjeo**: se lleva todo lo acumulado y ve su premio.
   - **Sigo jugando**: arriesga solo los puntos del nivel siguiente (si se queda sin vidas, conserva lo asegurado).
5. La pantalla final muestra puntos y premio para mostrar en el stand.

## Editar contenido (los "JSON")

- `data/preguntas.json`: niveles, preguntas, opciones y puntaje. `correcta` es el índice (0, 1 o 2) de la opción correcta; en pantalla las opciones se mezclan solas.
- `data/config.json`: título, cantidad de vidas, segundos por pregunta, PIN del panel, el aviso de seguir a CuyoConnect (`avisoSeguir`) y la tabla de premios por puntos.

Después de editar los JSON, regenerar la copia offline:

```bash
python3 generar-offline.py
```

## Panel de organización

Link "Panel de organización" en la pantalla inicial. PIN por defecto: **2468** (se cambia en `config.json`).

Muestra los participantes guardados en la tablet, un resumen de métricas (respuestas, % de aciertos, cuántos se plantaron) y dos descargas que Excel abre directo:

- **CSV de participantes**: nombre, apellido, email, puntos, premio, nivel alcanzado, si se plantó y fecha.
- **CSV de respuestas**: una fila por respuesta (jugador, email, nivel, número, pregunta, qué eligió, cuál era la correcta, si acertó, si se acabó el tiempo, segundos usados y puntos).

> Los datos se guardan en el `localStorage` del navegador de esa tablet: descargá los CSV antes de borrar el historial o cambiar de dispositivo.

### Volumen de datos

Cada partida ocupa ~2,4 KB con el detalle de respuestas, así que **1000 partidas son ~2,4 MB** contra el límite de ~5 MB por navegador: el panel abre y exporta en milisegundos.
El panel avisa cuando se superan los 3,5 MB y, si el navegador rechaza una escritura, el juego muestra un cartel para descargar los CSV y borrar los datos. Conviene exportar y limpiar al final de cada jornada.
