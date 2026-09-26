# Salven el Millón — CuyoConnect

Juego de preguntas para usar en un stand desde una tablet o celular. Es un frontend estático (HTML, CSS y JavaScript), con persistencia centralizada en Supabase y respaldo offline en el navegador.

## Cómo levantarlo

Desde esta carpeta ejecutá:

```bash
python3 -m http.server 8000
```

Después abrí en la misma computadora:

```text
http://localhost:8000
```

Para abrirlo desde una tablet conectada al mismo Wi-Fi, consultá la IP de la computadora:

```bash
hostname -I
```

Y en la tablet entrá a `http://IP-DE-LA-COMPUTADORA:8000`, por ejemplo `http://192.168.1.20:8000`. Si no abre, revisá que el firewall permita el puerto 8000.

También se puede abrir `index.html` con doble clic, pero para Supabase y para probar en otros dispositivos conviene usar el servidor HTTP.

## Configurar Supabase

Sin esta configuración el juego sigue funcionando en **modo local**, pero los datos quedan solamente en ese navegador.

1. Creá un proyecto en Supabase.
2. Abrí `supabase/migrations/001_partidas.sql`.
3. Copiá todo el SQL y ejecutalo en **Supabase > SQL Editor**.
4. En una consulta nueva del SQL Editor, creá la clave administrativa con el siguiente bloque. Reemplazá `TU-CLAVE-LARGA` y no guardes esa clave en el repositorio:

```sql
insert into private.salven_config (id, admin_pin_hash)
values (true, extensions.crypt('TU-CLAVE-LARGA', extensions.gen_salt('bf')))
on conflict (id) do update
set admin_pin_hash = excluded.admin_pin_hash;
```

5. En el diálogo **Connect** del proyecto copiá la Project URL y la **Publishable key**.
6. Pegá ambos valores en `data/supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: 'https://tu-proyecto.supabase.co',
  publishableKey: 'sb_publishable_...',
};
```

La publishable key está pensada para usarse en el navegador. **Nunca** pongas la `secret` o `service_role` key en este proyecto.

La migración aplica Row Level Security: el frontend público puede registrar partidas mediante una función limitada, pero no puede leer ni escribir la tabla directamente. El panel lee y borra datos únicamente a través de funciones que validan la clave administrativa.

Si el proyecto ya estaba configurado antes de la corrección del borrado, ejecutá también
`supabase/migrations/002_corregir_borrado_partidas.sql` en el SQL Editor.

Para cambiar la clave administrativa más adelante, repetí el bloque `insert ... on conflict` anterior o ejecutá:

```sql
update private.salven_config
set admin_pin_hash = extensions.crypt('TU-NUEVA-CLAVE', extensions.gen_salt('bf'))
where id = true;
```

## Datos y modo offline

Al terminar cada partida se registra:

- nombre, apellido y email;
- edad y departamento de Mendoza;
- puntos, premio, nivel alcanzado y fecha;
- cada pregunta, respuesta elegida, respuesta correcta, acierto, tiempo y puntos.

Con Supabase configurado, la partida se envía a la base y se elimina de la cola local. Si se corta internet, queda en `localStorage` y se reintenta automáticamente al abrir la app o terminar otra partida. Esto evita perder datos en el stand, pero conviene recuperar la conexión antes de cerrar o borrar los datos del navegador.

## Panel de organización e informes

Entrá desde **Panel de organización** en la portada.

- Con Supabase configurado, usá la clave elegida en la migración SQL.
- En modo local, el PIN de prueba es `2468` y se cambia con `pinAdminLocal` en `data/config.json`.

El panel muestra un resumen operativo y permite descargar dos informes construidos sobre todas las partidas, sin filtros:

- **PDF visual:** indicadores generales, edad promedio, gráficos por departamento, rango de edad, premio, resultado y nivel alcanzado; rendimiento agregado por pregunta; y un anexo con nombre, apellido, email y demás datos de cada participante.
- **Excel completo:** hojas `Resumen`, `Participantes`, `Respuestas` y `Preguntas`. La hoja `Respuestas` detalla, para cada persona y pregunta, qué contestó, cuál era la respuesta correcta y si acertó o se equivocó.

Para que el navegador no se vuelva lento con miles de filas, la tabla visual muestra las últimas 250 partidas; los informes incluyen todas (la carga desde Supabase se pagina de a 1.000). Con varios miles de personas, la generación del PDF puede tardar unos segundos porque incorpora el padrón completo.

## QR de Instagram

La pantalla del premio muestra un QR local que apunta a:

```text
https://www.instagram.com/cuyoconnect/
```

El enlace visible se configura con `instagramUrl` en `data/config.json`. Si cambia la cuenta, también hay que regenerar `assets/instagram-qr.svg` para que el QR apunte al nuevo destino.

## Editar preguntas y premios

- `data/preguntas.json`: niveles, preguntas, opciones y puntaje. `correcta` es el índice `0`, `1` o `2`.
- `data/config.json`: título, vidas, tiempo, premios, Instagram y PIN del modo local.

Después de editar cualquiera de esos JSON, actualizá la copia que permite abrir el juego sin servidor:

```bash
python3 generar-offline.py
```

## Flujo del juego

1. El participante carga sus datos.
2. Juega tres niveles: 4 preguntas de 100 puntos, 3 de 200 y 3 de 300.
3. Tiene una vida por nivel. Un error o tiempo agotado termina ese nivel.
4. Al completar un nivel, puede plantarse o seguir jugando.
5. La pantalla final muestra los puntos, la condición de retiro y el QR de Instagram. El premio se define en el evento.
