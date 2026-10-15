# Rediseño del backoffice ZQUARE — guía de implementación

Esta guía es para implementar el rediseño del backoffice (backoffice.zquare.uy). Se diseñó en un lienzo de Claude con datos reales del backoffice. Seguí esta guía pantalla por pantalla, en orden, y abrí un PR por bloque.

- Lienzo de diseño (referencia visual, para humanos): https://claude.ai/artifact/PqYQ2CjH3ZzKPsLenmhLNn
- Design system ZQUARE: https://claude.ai/artifact/EVpSwMcbXLDscW4J2MFfTk
- Estilos: `zquare-globals.css` (se entrega junto con esta guía)

## Principios (aplican a todo)

1. **Menos texto, más visual.** Resúmenes de una línea, cifras grandes, chips en vez de grillas de campos. Si un texto largo no ayuda a decidir algo, va detrás de un "Leer más".
2. **Datos reales siempre.** Nada inventado. Si algo falta en la base, se muestra un estado vacío útil ("Sin monto · Cargar monto"), no un valor de relleno. Lo que sea de ejemplo se marca con el badge "Datos de ejemplo".
3. **Ver y crear sin salir de la pantalla.** Fichas y formularios se abren en un popover (escritorio) o en una hoja inferior (celular), no en otra página. La excepción es la ficha de proyecto, que es una página.
4. **Un solo botón primario por vista.** Carbón en tema claro, lima en oscuro.
5. **Lima es un acento, no un fondo.** Se usa en el ítem activo del sidebar, el badge "activo", la nota de una idea aprobada, las tareas elegidas para el sprint y los highlights de estado. Nada más.
6. **Español rioplatense, voseo, sin emojis.** Íconos de trazo (grilla 24, trazo 1.75), no emojis.
7. **Accesible:** `<button>`, `<a>` e `<input>` + `<label>` reales; `aria-label` en los botones de solo ícono; foco visible (anillo de 2px en `--ring`); áreas táctiles de 44px o más en celular.

## Paso 0 — Base

1. **Estilos.** Reemplazá o mergeá `app/globals.css` con `zquare-globals.css`. Ese archivo trae:
   - el mapeo de los tokens ZQUARE a las variables de shadcn (`:root` y `.dark`);
   - los colores extra (`--lima`, `--carbon`, `--crema`, `--arena`, `--positivo`, `--negativo`, `--aviso`);
   - las clases de patrones `zq-*`.
2. **Fuentes.**
   - Plus Jakarta Sans con `next/font/google` (pesos 400–700) → `--font-sans`.
   - SK Reykjavik Rounded va en `--font-display` (títulos). Es comercial y no está en el repo: dejá el stack con fallback a Plus Jakarta Sans y un TODO para cargar el `.woff2` licenciado.
3. **Tema oscuro.** Con la clase `.dark` en `<html>`, el layout es el mismo y solo cambian los tokens. No hardcodees colores salvo:
   - la hoja blanca de la vista previa de documentos;
   - los colores por tipo de archivo (ver Documentos).
4. **Formato de números.** `es-UY`, con punto de miles y coma decimal ("USD 8.169,55"). Las cifras van con `tabular-nums`, y los montos de tablas alineados a la derecha.
5. **Fechas.** "14 oct.", "18 oct. · en 4 días", "Venció hace 15 días". Relativas cuando están cerca (Hoy, Mañana, en N días).

## Paso 1 — Piezas compartidas

Hacé estas piezas antes de cualquier página.

### Layout

- **Sidebar carbón a la izquierda (240px):**
  - logo arriba e ítem activo en lima;
  - secciones "Desarrollo" (Proyectos, Tareas, Ideas) y "Gestión" (Clientes, Reuniones, Documentos, Finanzas, Decisiones);
  - Inicio primero;
  - abajo, el usuario: avatar con iniciales, nombre y mail.
- **Campanita** de notificaciones arriba a la derecha del sidebar, con un badge lima que muestra la cantidad sin leer. Abre el **Panel lateral**.
- **Contenido:** `max-width` de 1240px, `padding` de 40px y separación de 20–28px entre bloques. En pantallas de menos de 720px el sidebar se reemplaza por el menú de celular (ver abajo).

### Encabezado de página (`.zq-encabezado`)

- Título display de 32/38 sobre el fondo, **sin banda de color**, con un filete de 1px abajo.
- Acciones a la derecha, con un solo primario.
- Pantallas con vistas (Tareas): pestañas tipo píldora (Tablero · Backlog · Calendario) al lado del título, como links a rutas distintas.
- Fichas (proyecto): botón cuadrado "←" de 40px a la izquierda del título, que vuelve al listado. **No usar migas de pan.** Arriba del título puede ir un rótulo chico en mayúsculas ("IBER · DESARROLLO A MEDIDA").

### Popover (`.zq-velo` + `.zq-popover`)

- **Fondo:** cubre toda la pantalla, oscurecido al 22% con `backdrop-filter: blur(6px)`. Clic afuera o Esc cierran.
- **Panel:** centrado en la pantalla completa, radio de 14px, en **dos columnas**:
  - a la izquierda el contenido (título, texto, comentarios);
  - a la derecha una columna de 220–300px sobre `--background` con los datos (desplegables o chips) y los **botones abajo a la derecha**: secundario (Cancelar/Cerrar) + primario.
- **Validación:** abajo a la izquierda, en texto tenue, va qué falta para poder guardar ("Falta el título", "Elegí los días en el calendario"). El primario queda al 45% de opacidad y con `aria-disabled` hasta que se pueda guardar. Después de guardar, "✓ Guardado / Creada".
- **Implementación:** sobre `Dialog` de shadcn. En menos de 720px se convierte en **Hoja inferior** (sobre `Sheet` con `side="bottom"`).

### Panel lateral (notificaciones)

- 380px de ancho, pegado al sidebar. La página queda borrosa y el sidebar no.
- Notificaciones agrupadas por tipo (Proyectos, Decisiones, Tareas, Finanzas). Cada grupo lleva un ícono en un cuadradito de color y un separador.
- Sin leer: texto en peso 500 y un punto oscuro a la derecha. Leídas: texto tenue.
- En celular ocupa todo el ancho.

### Hoja inferior (celular)

- Radio de 24px arriba y una manija de 40×5px.
- Datos como chips que se tocan para cambiar.
- Botones grandes al pie: secundario + primario a todo el ancho.

### Menú de celular (menos de 720px)

- **Barra superior:** ☰, título display de 24px y campanita a la derecha.
- **☰** abre el menú a pantalla completa sobre el fondo del sidebar, con las secciones en 20px, ✕ arriba a la derecha y el usuario abajo.
- **Crear:** botón flotante de 56px, radio de 18px, carbón con "+" lima, abajo a la derecha.

## Paso 2 — Pantallas

### Tareas · Tablero (`/tareas`)

- **Encabezado:** "Tareas" + pestañas, y a la derecha Filtros + "Nueva tarea" (primario).
- **Barra del sprint activo:**
  - badge "Sprint N", nombre, mini barra de avance con "21/25" y "Venció hace X días" en negativo si pasó la fecha de fin;
  - a la derecha "Completar sprint", con estilo fantasma.
- **Columnas** Por hacer · En curso · En revisión sobre fondo hundido, cada una con su contador. La columna Hecho se resume en una tarjeta ("21 tarjetas hechas · Ver →").
- **Tarjeta:**
  - "Cliente · ZQ-NNN" en tenue y el título;
  - abajo, el avatar del responsable (circunferencia punteada si no tiene);
  - si la prioridad es Alta o Urgente, la palabra en aviso;
  - la fecha límite en negativo si venció y en aviso si faltan 7 días o menos.
- Clic en una tarjeta → **Ficha de tarea**.

### Ficha de tarea (Popover)

- **Izquierda:**
  - "ZQ-228" y el título en display de 26px;
  - un bloque "Sin brief todavía · Claude te hace unas preguntas y lo completa" con el botón **Desarrollar**, si la tarea no tiene `resultado`. Si lo tiene, el bloque dice "Brief listo";
  - Comentarios, y un input con botón de enviar.
- **Derecha:**
  - Columna (chip que cambia de estado), Prioridad y Responsable ("+ Asignar");
  - Vence ("18 oct. · en 4 días" en aviso);
  - Sprint, y Cliente · Proyecto ("Interna · —" si no tiene);
  - "Creada por X · fecha";
  - abajo, eliminar (ícono en negativo) + Editar (primario).

### Nueva tarea (Popover)

- **Izquierda:**
  - título (input grande en display), "¿Qué hay que hacer?";
  - descripción opcional;
  - interruptor **"Que Claude desarrolle el brief"**, prendido por defecto.
- **Derecha:** desplegables de Columna (Backlog, Por hacer, En curso, En revisión), Prioridad (Baja, Media, Alta, Urgente), Responsable (socios), Fecha límite, Cliente o proyecto (agrupado) y Sprint ("Sprint N (activo)" / "Sin sprint").
- Solo el título es obligatorio (3 caracteres o más). Enter crea.

### Tareas · Backlog (`/tareas/backlog`)

- **Izquierda:**
  - **selector de proyecto** como botón grande: cuadradito de color, "Modelo Sommelier", "Iber · 4 tareas" y ▾. Abre un desplegable con buscador (por proyecto o cliente), "Todos los proyectos" y cada proyecto con su cantidad de tareas pendientes. Tiene que escalar a muchos proyectos;
  - la lista de tareas sin sprint de ese proyecto, en filas cortas: ⠿ para arrastrar, punto de urgencia (rojo si es urgente, amarillo si es alta, gris el resto), nombre corto, proyecto (solo en "Todos") y código. Al pasar el mouse aparece **"Al sprint →"**;
  - el título completo va en `title` / tooltip.
- **Derecha, fija (sticky): panel del sprint** (`.zq-sprint-panel`), carbón:
  - "SPRINT N" y un contador lima;
  - las tareas elegidas en lima con ✕ para sacarlas;
  - una zona punteada "Arrastrá tareas acá" que se ilumina (`data-sobre="true"`) cuando arrastrás algo encima;
  - "N tareas elegidas" e **Iniciar sprint**, a todo el ancho.
- **Arrastre:** drag & drop nativo o dnd-kit, y "Al sprint →" como alternativa accesible.
- **Celular:** el panel baja debajo de la lista.

### Tareas · Calendario (`/tareas/calendario`)

- **Barra superior:** mes con ‹ › y "Hoy"; a la derecha, filtros tipo chip que se prenden y apagan: Reuniones, Tareas que vencen, Proyectos, Sprints.
- **Grilla de 7 columnas** (lunes a domingo):
  - cada día es una tarjeta de 128px de alto mínimo;
  - fines de semana sobre el fondo; hoy con borde de tinta y el número dentro de un círculo.
- **Sprints:** franja arena de 16px arriba de cada día, con el nombre del sprint el día que empieza y los lunes. Si se superponen dos sprints, la franja va rayada.
- **Eventos** en chips de 11px: reunión en lima, entrega o arranque de proyecto en carbón, tarea que vence con contorno. Máximo 3 por día y después "+ N más".
- **Fuentes de datos:**
  - sprints, con sus ceremonias planning, review y retro (sin las dailies);
  - `fecha_inicio` y `fecha_fin_estimada` de los proyectos;
  - `fecha_limite` de las tareas abiertas;
  - reuniones agendadas.

### Proyectos (`/proyectos`)

- **Tabla:** Proyecto (nombre + cliente), Estado (badge), Salud (Vence pronto / Al día / Sin fecha), Responsable, Avance (barra + "Sprint 7 · 21 de 25 (84%)"), Fin (fecha + "Mañana"/"En 8 semanas") y Plata (USD, alineado a la derecha, con nota "Estimado Fase 1" o "Cargar lo acordado").
- **Filtros** en el encabezado: estado, cliente y responsable.
- **Abajo, un aviso punteado** si hay propuestas sin arrancar: "N propuestas sin arrancar" + "Comenzar con Claude".

### Ficha de proyecto (`/proyectos/[id]`, página)

- **Encabezado:** "←" + rótulo (cliente · tipo) + nombre; a la derecha un badge lima de urgencia ("Entrega mañana") + Editar.
- **Pestañas subrayadas:** Resumen · Tareas · N · Documentos · N · Decisiones · N · Plata.
  - **Resumen:**
    - 3 tarjetas: Sprint (porcentaje grande + barra + "21 de 25 hechas"), Responsable (avatar + equipo) y Fin estimado (fecha grande + "Mañana" en aviso, con borde aviso si faltan 7 días o menos);
    - abajo, el objetivo en una frase.
  - **Tareas:** barra con "96 hechas · 2 abiertas" y las abiertas como filas (estado, nota y responsable). Las que tienen la etiqueta `bloqueada-por-cliente` dicen "Bloqueada por el cliente".
  - **Documentos:** lista de archivos (ícono por tipo, nombre, carpeta y fecha).
  - **Decisiones:** la decisión con fecha, presentes (avatares) y sus puntos en tarjetas cortas.
  - **Plata:** si no hay monto ni presupuesto, estado vacío con "USD —", "Cargar monto" y "Crear presupuesto".

### Inicio (`/`) — "Mi día"

- **Encabezado:** isotipo, fecha en mayúsculas tenue ("MIÉRCOLES 14 DE OCTUBRE") y "Buen día, {nombre}"; a la derecha un buscador con ⌘K.
- **Columna principal:**
  - **Para atender hoy:** lista con la fecha relativa coloreada (negativo si venció, aviso si es pronto), título, detalle y una acción fantasma;
  - **Mis tareas** del sprint activo.
- **Columna lateral:** Agenda (con la ilustración de la mascota si no hay reuniones), Mis proyectos (barra de avance) y "La empresa" (conteo por estado).

### Ideas (`/ideas`) — muro de post-its

- **Notas giradas ±1°:** aprobadas en lima, semillas en `--card` con borde. Cada nota lleva código · etapa, autor, título display, 4 líneas de texto, etiquetas, votos y una acción ("Ver proyecto →" o "Bajar a tierra con Claude →").
- **Al final**, una nota punteada "Anotá una semilla".
- Clic en el título → **Ficha de idea**: la misma nota agrandada (`.zq-postit`), centrada sobre el fondo borroso. Contiene:
  - Problema, Solución y Deja, en una línea cada uno; "Leer más →" despliega Competencia, Esfuerzo y Próximo paso;
  - la votación **"¿La hacemos?"**: tres botones Sí / Tengo dudas / No (`.zq-voto`, `aria-pressed`) con su conteo e iniciales de quién votó encima; tocar el propio voto lo saca; abajo, "Faltan X e Y";
  - un campo "¿Qué opinás?" para comentar;
  - si ya es proyecto, un botón carbón "Ya es proyecto: <nombre> →". Si la idea está "lista", ahí va "Pasar a proyecto".
- **Modelo de datos:** hoy el voto es un único "voto a favor". Hay que sumar el valor del voto (`si` | `dudas` | `no`) por socio.

### Reuniones (`/reuniones`)

- **Agenda semanal** (lunes a viernes, de 9 a 18, en medias horas): reunión con cliente en lima, interna en carbón, encuesta abierta punteada. En las reuniones cortas el título y la hora van en una línea con elipsis.
- **Semana vacía:** overlay con la mascota, "Semana sin reuniones" y "Coordinar una reunión".
- **Columna derecha:** "Encuestas abiertas" con "2 de 4 respondieron · faltan vos y Nicolás" y "Marcar mi disponibilidad".
- **Nueva reunión (Popover):**
  - **izquierda:** título, socios que tienen que estar (avatares que se tocan), Cliente o proyecto, interruptor "Invitar al cliente" con un campo de mails (Enter agrega un chip y ✕ lo quita) y notas (un área grande que ocupa el espacio que sobra);
  - **derecha:** DURACIÓN (30 min / 1 hora), alineada con el título, y debajo un **calendario de mes para elegir el rango**: primer clic marca el inicio y segundo clic el fin, el rango se pinta en lima con los extremos en tinta, los días pasados quedan deshabilitados y los fines de semana tenues;
  - botones abajo a la derecha: Cancelar + **Pedir disponibilidad** (habilitado con título, al menos un socio y un rango).
- **Encuesta de disponibilidad (Popover):**
  - **izquierda:** grilla días × horas (de 9 a 17, una por hora). Tocar una celda la marca en lima y tocar el nombre de un día marca el día entero; cada celda muestra puntitos con los socios que ya pueden;
  - **derecha:** Respuestas (quién respondió y quién falta) y Mejores huecos (las celdas donde coinciden todos los que respondieron), Cancelar y Guardar.
  - Después se agenda con Google Calendar + Meet, con el flujo que ya existe.

### Documentos (`/documentos`)

- **Arriba:**
  - buscador grande en forma de píldora, "Buscá por nombre o por significado", con ⌘K;
  - debajo, "44 de 59 documentos indexados · Actualizar índice".
- **Carpetas por cliente** como tarjetas seleccionables, con cantidad y fecha del último archivo.
- **Lista de archivos** de la carpeta elegida: tipo, nombre, subcarpeta y fecha.
- Clic en un archivo → **Ficha de documento (Popover)**:
  - **izquierda:** vista previa en una hoja blanca;
  - **derecha:**
    - ícono por tipo: DOC `#4a7bd0`, XLS `#2f8f5b`, PDF `#c94a3d`, PPT `#d9822b`, PNG `#7a5ab8`, MP4 carbón, TXT gris;
    - nombre, carpeta, fecha y tipo;
    - **Vinculado**: la decisión que salió de ese documento, el proyecto (si la subcarpeta coincide con un proyecto) y el cliente;
    - Cerrar + **Abrir en Drive ↗**.

### Finanzas (`/finanzas`)

- **Encabezado:** botones + Ingreso, − Gasto, ⇄ Transferencia.
- **Resultado:**
  - "Resultado acumulado" en grande (USD);
  - Entró / Salió / En caja;
  - a la derecha, el gráfico de área del resultado acumulado por mes, en lima.
- **Entre socios:** 4 avatares con su saldo (+ a favor en positivo, − en negativo) y una sugerencia para saldar ("Martín recibe USD 6,3 de cada uno") con el botón Registrar.
- **Últimos movimientos:** 5 filas con flecha ↑ o ↓ y monto con signo, más "Ver todos →".
- **Nuevo movimiento (Popover):**
  - **izquierda:**
    - selector Ingreso / Gasto / Transferencia;
    - moneda (USD/UYU; con UYU aparece la cotización) + monto grande;
    - descripción;
    - "¿Quién lo pagó/cobró?", con los avatares de los socios + "Fondo común";
    - una caja de resumen que se recalcula ("Cada socio le debe USD 6,30 a Martín"; el fondo común no genera deuda).
  - **Transferencia:** "Paga → Recibe" entre socios, para saldar deudas (usa `registrar_liquidacion`).
  - **derecha:** Categoría, Fecha, Se divide entre (los 4 en partes iguales / elegir), Cliente o proyecto, Estado (Confirmado/Previsto) y los botones.

### Decisiones (`/decisiones`)

- **Acuerdos de socios:** tarjeta carbón fijada arriba con el título "Acuerdos de socios", "Siempre fijados arriba" y "+ Nuevo acuerdo". Cada acuerdo lleva título display, detalle, avatares de los socios y fecha.
- **Decisiones por cliente:** pestañas píldora con conteo y una lista de fecha, título, resumen de 2 líneas y proyecto.
- Clic en una decisión o acuerdo → **Ficha de decisión (Popover de una columna)**:
  - chips de fecha y de "Cliente · Proyecto →", título display y el origen ("Reunión …");
  - los **puntos numerados**: una línea en negrita + aclaración corta + el **minuto de la reunión** como chip lima "▶ 40:27", que abre la transcripción en ese momento;
  - abajo, los presentes (socios en lima y cliente en arena, con "3 socios · 2 de Iber") y "▶ Transcripción completa".
  - Los puntos se arman a partir del `detalle` de la decisión: si viene numerado, un punto por número.

### Clientes (`/clientes`)

- **Lista a la izquierda:** iniciales en un cuadradito (lima si está activo), nombre y "Activo · 2 proyectos".
- **Ficha a la derecha:**
  - iniciales grandes, nombre, badge de estado y contacto (o "Sin contacto cargado" en itálica);
  - 4 cifras: Proyectos, Cobrado, Documentos y Decisiones;
  - la lista de proyectos con su estado;
  - la última actividad.

## Paso 3 — Celular (menos de 720px)

- Menú ☰ (ver Paso 1). Sin sidebar.
- **Tablero:** una columna por vez, con un selector segmentado Por hacer · En curso · Revisión (con contadores) y tarjetas a todo el ancho.
- **Tablas** (Proyectos): pasan a tarjetas.
- **Agenda semanal** (Reuniones): lista por día que **salta los días vacíos**, con la encuesta abierta arriba.
- **Chips con scroll horizontal** para carpetas (Documentos) y clientes (Decisiones).
- Todas las fichas y formularios van como **Hoja inferior**.
- Botón flotante "+" para crear en Tareas, Finanzas, Ideas, Clientes, Reuniones y Decisiones.

## Orden sugerido de PRs

1. Base: globals.css, fuentes, layout, encabezado, Popover/Hoja y menú de celular.
2. Tareas: Tablero, Ficha de tarea y Nueva tarea.
3. Backlog + Calendario.
4. Proyectos + Ficha de proyecto.
5. Inicio.
6. Finanzas + Nuevo movimiento.
7. Ideas + Ficha con la nueva votación (requiere migración).
8. Reuniones + Nueva reunión + Encuesta.
9. Documentos + Ficha de documento.
10. Decisiones + Ficha de decisión.
11. Clientes.

Cada PR se cierra cuando:

- la pantalla funciona con datos reales;
- se ve bien en tema claro, en oscuro y en 390px de ancho;
- tiene sus estados vacíos;
- todo es usable con teclado.

## Datos a corregir en la base

Esto apareció durante el diseño:

- **Nombres de sprint corridos:** el sprint número 7 se llama "Sprint 5 — …", y en general cada nombre está 2 números atrás. Además, los sprints 2 y 4 se superponen en fechas. En la UI se muestra el número.
- **Tareas sin proyecto:** las tarjetas ZQ-222 a ZQ-227 ("S0 · …") son de Modelo Sommelier pero no tienen proyecto asignado.
- **Tarjeta de prueba:** ZQ-11 ("PRUEBA — campos de planificación (borrar después)").
- **Sin montos:** Sistema contabilidad no tiene monto acordado ni presupuesto cargado.
