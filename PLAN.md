# Plan de desarrollo — Backoffice ZQUARE

> Plataforma interna de gestión para los 4 socios de ZQUARE (zquare.uy).
>
> **Documento vivo.** Esto es la versión 1 de una idea que va a evolucionar:
> nada de lo escrito acá es definitivo. Cualquier módulo, prioridad o decisión
> se puede cambiar en cualquier momento — se actualiza este documento y se
> registra en el historial de cambios al final. Última actualización: 2026-08-18.

## 1. Objetivo

Centralizar en una sola plataforma la gestión de la empresa:

- Registro de clientes, proyectos, presupuestos, documentos y decisiones.
- Control de gastos, ingresos y aportes de cada socio, con balance entre los 4.
- Dashboard con métricas del estado de la empresa.
- Base de datos bien estructurada que a futuro alimente herramientas con IA
  (generador de presupuestos, plantillas de contratos, estimador de tiempos).
- Acceso restringido exclusivamente a los 4 socios.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Stack | Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage) |
| Hosting | Vercel para la app, Supabase cloud para datos. Subdominio sugerido: `backoffice.zquare.uy` |
| Autenticación | Google OAuth (Workspace zquare.uy) con allowlist de los 4 mails |
| Documentos | Híbrido: los archivos viven en Google Drive del Workspace; el backoffice guarda metadata, categorías y links. Documentos generados por el sistema también se crean en Drive |
| Monedas | USD y UYU. Cada movimiento se registra en su moneda original con tipo de cambio del día; los reportes consolidan en USD |
| MVP | Fases 1-3: clientes+documentos, finanzas, dashboard. IA en fase 4 |

## 3. Arquitectura

```
┌─────────────────────────────────────────────┐
│  Next.js (Vercel) — backoffice.zquare.uy    │
│  UI: Tailwind + shadcn/ui                   │
│  Server Actions / Route Handlers            │
└──────────────┬──────────────┬───────────────┘
               │              │
      ┌────────▼───────┐  ┌───▼────────────────┐
      │   Supabase     │  │  Google Drive API  │
      │  Postgres+RLS  │  │  (Workspace)       │
      │  Auth (Google) │  │  archivos/carpetas │
      └────────────────┘  └────────────────────┘
```

- **Supabase Auth** con proveedor Google. Una tabla `socios` mapea los 4 mails
  autorizados; RLS (Row Level Security) bloquea cualquier otro usuario aunque
  logre autenticarse.
- **Google Drive**: estructura de carpetas estándar en una unidad compartida
  (`Clientes/<Cliente>/<Proyecto>/…`). El backoffice guarda `drive_file_id` +
  URL de cada documento. Primera iteración: pegar el link del archivo;
  segunda: Google Picker para elegirlo sin salir de la app.
- **Tipo de cambio**: se ingresa manualmente al registrar el movimiento
  (con default sugerido); a futuro se puede automatizar con la API del BCU.

## 4. Modelo de datos (núcleo)

Diseñado para que la fase de IA tenga datos ricos desde el día uno.

### Principios de diseño (reglas para toda migración futura)

El objetivo es una base limpia y evolutiva: agregar, modificar o eliminar
entidades debe ser barato, y todo el contenido debe servir como input de IA.

1. **Migraciones versionadas desde el día 1.** Cada cambio de esquema es un
   archivo de migración en el repo (Supabase lo soporta nativo). La DB se
   puede reconstruir desde cero y su evolución queda auditada.
2. **Convenciones uniformes.** Nombres en español sin tildes, `snake_case`,
   tablas en plural. Toda tabla lleva `id` (uuid), `created_at`, `updated_at`
   y `created_by`. Un esquema predecible es fácil de modificar — y fácil de
   explicarle a una IA.
3. **Nada se borra: soft delete.** `deleted_at` en lugar de DELETE físico.
   El histórico completo es justamente el activo que alimenta la IA.
4. **Estructurado + texto libre, siempre.** Cada entidad combina campos
   categóricos (estado, tipo, montos, fechas) con campos de texto rico
   (descripción, notas). Los categóricos habilitan métricas y filtros; el
   texto le da contexto semántico a la IA.
5. **Estados como catálogos, no enums rígidos.** Check constraints o tablas
   de referencia en lugar de enums de Postgres (que son difíciles de
   modificar). Agregar un estado nuevo es una migración trivial.
6. **Válvula de escape controlada.** Campo `metadata jsonb` en las entidades
   principales para atributos experimentales sin migración; si un atributo se
   consolida, se promueve a columna real. Evita tanto el schema churn como el
   caos de "todo en JSON".
7. **Normalización sin duplicados.** Relaciones explícitas con foreign keys;
   un dato vive en un solo lugar.
8. **Listo para IA sin rediseño.** Supabase soporta `pgvector`: en la fase 4
   los documentos, decisiones y presupuestos se indexan con embeddings para
   búsqueda semántica sin tocar el esquema. Y todo es exportable a
   JSON/CSV estructurado como contexto para cualquier modelo.

- **socios** — id, auth_user_id, nombre, email.
- **clientes** — nombre, empresa, contacto, estado (prospecto / activo / inactivo), notas.
- **proyectos** — cliente_id, nombre, descripción, estado (propuesta / en curso / entregado / mantenimiento / cancelado), fecha_inicio, fecha_fin_estimada, fecha_fin_real, horas_estimadas, horas_reales. *(estimado vs. real alimenta el futuro estimador)*
- **presupuestos** — proyecto_id, versión, moneda, monto_total, estado (borrador / enviado / aprobado / rechazado), fecha_envío, link a Drive.
- **presupuesto_items** — presupuesto_id, descripción, horas, tarifa, subtotal. *(el detalle por ítem es la materia prima del generador de presupuestos con IA)*
- **documentos** — cliente_id / proyecto_id, tipo (presupuesto / análisis / propuesta / contrato / otro), título, drive_file_id, drive_url, tags, subido_por, fecha.
- **decisiones** — proyecto_id (nullable: decisiones de empresa), fecha, título, detalle, participantes.
- **movimientos** — tipo (ingreso / gasto / aporte_socio / retiro_socio), fecha, moneda, monto, tc_a_usd, categoría, descripción, socio_id (quién pagó o recibió), cliente_id / proyecto_id opcional, link a comprobante.
- **balance de socios** — vista derivada: total aportado por cada socio vs. el promedio → cuánto está "abajo" cada uno para ajustar en próximos cobros.

Datos iniciales conocidos para cargar al estrenar el módulo de finanzas:

- Aporte de Joaquín: 230 USD (seña diseñadora de marca; quedan 230 USD pendientes de pago).
- Aportes de Martín: dominio zquare.uy + Google Workspace Starter (montos a confirmar).

## 5. Uso simple y consistente

Principio rector: **la consistencia la garantiza el sistema, no la disciplina
de cada socio.** El backoffice impone la estructura; los 4 encuentran todo en
el mismo lugar, siempre.

- **Ficha estándar.** Todos los clientes se ven exactamente igual, y todos los
  proyectos también: mismas pestañas (Resumen · Presupuestos · Documentos ·
  Decisiones · Finanzas). Buscar algo del cliente A funciona idéntico que en
  el cliente Z.
- **Búsqueda global** (barra tipo Cmd+K): escribís el nombre de un cliente,
  proyecto o documento y saltás directo, sin navegar menús.
- **Alta guiada con mínimos.** Crear un cliente o proyecto pide solo lo
  indispensable; el resto se completa después. Que cargar datos nunca dé
  pereza.
- **Estructura de carpetas Drive estandarizada y automática.** Al dar de alta
  un cliente o proyecto, el sistema crea las carpetas en Drive vía API —
  idénticas para todos los clientes, sin excepciones. **Plantilla confirmada
  por Joaquín el 2026-07-23** (basada en la estructura real de la carpeta
  "Cognitiva", el nombre viejo de la empresa):

```
ZQUARE (Unidad compartida del Workspace)
├── Empresa/
│   ├── Minutas internas/
│   └── Plantillas/              ← ej. "Guia para contrato"
└── Clientes/
    └── <Cliente>/               (ej: Iberpark)
        ├── Contrato/
        ├── Minutas/
        ├── Presupuestos/
        └── Proyectos/
            └── <Proyecto>/      (ej: Modelo Sommelier)
                ├── Analisis y propuesta/
                ├── Presentaciones/
                └── Entregables/
```

- **Drive como nube del sistema (decidido el 2026-07-23).** El backoffice se
  integra con la API de Drive como interfaz sobre el almacenamiento real:
  - *Etapa 1:* creación automática de carpetas al dar de alta cliente/proyecto
    + listado en vivo de los archivos de la carpeta en cada ficha.
  - *Etapa 2:* subir archivos a Drive desde el backoffice.
  - Prerrequisitos: Unidad compartida "ZQUARE" creada, cuenta de servicio de
    Google con la Drive API habilitada y agregada como miembro de la unidad.
  - Migración pendiente: mover/copiar el contenido de "Cognitiva" (hoy en
    cuentas personales, dueños alannicolasort y joaco1119) a la unidad
    compartida. Ojo: los Google Docs de cuentas personales se copian con
    "Hacer una copia" para que queden como propiedad de la empresa.

## 6. Fases de implementación

### Fase 0 — Fundaciones *(1 sesión)*
- [x] Repo git + proyecto Next.js 16 (TypeScript, Tailwind v4, shadcn/ui) en `zquare-backoffice/`
- [x] Esquema inicial + RLS (migración en `zquare-backoffice/supabase/migrations/`)
- [x] Código de login con Google + allowlist de los 4 mails (proxy + RLS)
- [x] Layout base (sidebar, login, tema)
- [x] Proyecto Supabase creado y migración aplicada (RLS verificado)
- [x] OAuth de Google configurado (consentimiento Interno, solo cuentas @zquare.uy) — login probado con éxito el 2026-07-23
- [x] Deploy en Vercel (Hobby) — repo público `github.com/ZQUARE-UY/backoffice`, producción en `https://backoffice-zeta-teal.vercel.app` (login end-to-end OK el 2026-07-23)
- [x] DNS: subdominio `backoffice.zquare.uy` funcionando con SSL (verificado por TXT desde la cuenta Vercel de Martín, 2026-07-23)
- [x] Invitar a los 3 socios a la organización GitHub ZQUARE-UY (invitaciones
  enviadas el 2026-07-27 a nicolas@, francisco@ y martin@zquare.uy; pendiente
  que cada uno acepte)

> **Notas de deploy (para no repetir tropiezos):**
> - Vercel Hobby no deploya repos privados de una organización → el repo se dejó público (no contiene secretos; `.env.local` está en gitignore). Alternativa futura si se quiere privado: Cloudflare Pages (gratis) o Vercel Pro.
> - Usar SIEMPRE la URL estable de Vercel (`backoffice-zeta-teal.vercel.app`), no las URLs con hash por-deploy. El Site URL y los Redirect URLs de Supabase apuntan a la estable.
> - Al cargar env vars en Vercel, pegar el valor en texto plano — si se copia el campo enmascarado se guardan caracteres "•" y el login falla con "Cannot convert argument to a ByteString".

### Fase 1 — Clientes y documentos *(2-3 sesiones)*
- [x] CRUD de clientes y proyectos (migración + fichas + alta guiada, verificado end-to-end el 2026-07-23)
- [x] Presupuestos con ítems por horas y versionado (editor con total en vivo, CRUD completo, verificado el 2026-07-23)
- [x] Documentos: alta con link a Drive, tipos (incl. minuta) y tags, CRUD completo (verificado el 2026-07-23)
- [x] Integración Drive etapa 1: carpetas automáticas al dar de alta cliente/proyecto + listado en vivo en las fichas (verificado end-to-end el 2026-07-23; env vars `GOOGLE_DRIVE_SHARED_ID` y `GOOGLE_SERVICE_ACCOUNT_KEY_B64` cargadas en Vercel el 2026-07-24 — pendiente confirmar con una alta de prueba en producción)
- [x] Integración Drive etapa 2: subir archivos desde el backoffice (subida "resumable" directa navegador→Google, sin límite de tamaño; botón en la ficha del cliente con selección de subcarpeta y barra de progreso). **Verificado end-to-end en producción el 2026-07-24** (subida real OK, el PUT cross-origin/CORS funciona). Incluye botón "Crear carpeta en Drive" para clientes dados de alta antes de configurar Drive.
- [x] Migrar contenido de "Cognitiva" a la unidad compartida ZQUARE (hecho el
  2026-07-27 vía API con la cuenta de servicio: 47 archivos copiados a la
  estructura estándar, 1 duplicado descartado, 0 errores. Los Google Docs se
  migraron por export+reimport porque el Gmail de Alan está sin cuota y Google
  bloquea copiarlos — nota: por eso pierden historial/comentarios, solo
  contenido. Los originales siguen en la cuenta de Alan; se pueden archivar
  cuando quieran. Si joaco1119 tiene contenido aparte no incluido en la
  carpeta compartida, repetir el proceso.)
- [x] Búsqueda global (Cmd+K) sobre clientes, proyectos y documentos (verificado el 2026-07-23)
- [x] Registro de decisiones (bitácora con participantes y vínculo opcional a cliente, verificado el 2026-07-23)
- [x] Carga de datos históricos: seed `supabase/seeds/20260727_clientes_historicos.sql`
  aplicado el 2026-07-27 (Iberpark + proyectos Modelo Sommelier y Sistema
  contabilidad en propuesta; Pedro Montero con Voice to image cancelado;
  proyecto PEO entregado bajo Punta Del Este Operadora; todos vinculados a sus
  carpetas de Drive migradas).
- [ ] (Opcional) Google Picker para elegir archivos de Drive desde la app

### Fase 2 — Finanzas *(2 sesiones)*
- [x] Movimientos: ingresos, gastos, aportes y retiros, multi-moneda con TC (monto en moneda original + `monto_usd` calculado por la DB; alta/edición/borrado; verificado build el 2026-07-24, pendiente aplicar migración y probar end-to-end)
- [x] Categorías de gasto/ingreso (catálogo sugerido con datalist, categoría libre)
- [x] Balance entre socios (vista `balance_socios`: aporte neto por socio vs. promedio, quién está abajo y por cuánto)
- [x] Carga de movimientos históricos: seña diseñadora (gasto + aporte de Joaquín, 230 USD) vía `supabase/seeds/`; dominio + Workspace cargados por Martín desde la app (2026-07-27)

### Fase 3 — Dashboard *(1-2 sesiones)*
- [x] Métricas en la home: ingresos, gastos, resultado (USD), clientes activos, proyectos en curso, y proyectos por estado (verificado build el 2026-07-24)
- [x] Evolución mensual (ingresos vs. gastos últimos 6 meses, barras CSS sin librerías)
- [x] Vista de balance de socios (componente compartido con Finanzas)

### Post-MVP — Tablero de tareas *(kanban propio, sin Jira)*
- [x] Decisión 2026-07-28: tablero **propio** en el backoffice en lugar de
  integrar Jira. El Jira disponible es una cuenta personal (joaco1119), no de
  ZQUARE, e integrarlo dejaría dos fuentes de verdad y una dependencia de su
  API justo en la parte que más importa: que los LLM operen las tarjetas. Con
  tablero propio las tarjetas viven en Supabase, se vinculan a clientes y
  proyectos, y se exponen por el MCP que ya está en producción. Arranca vacío
  (sin importar los issues de Jira).
- [x] Migración `20260728000003_tareas.sql`: tablas `tareas` (columnas backlog /
  en_curso / en_revision / hecho, prioridad, responsable, cliente, proyecto,
  etiquetas, fecha límite) y `tareas_comentarios`. Dos detalles de diseño:
  `numero` da un código corto y estable (`ZQ-12`) para referenciar una tarjeta
  en lenguaje natural, y `orden` es numeric para que mover una tarjeta escriba
  UNA sola fila (el punto medio entre sus vecinas).
- [x] Tablero en `/tareas`: 4 columnas, drag & drop entre columnas y dentro de
  cada una (optimista), alta desde el header o desde cada columna, y ficha de la
  tarjeta en diálogo con edición, comentarios y borrado.
- [x] Home: métrica "Tareas abiertas" y tarjeta "Mis tareas" (lo asignado al
  socio logueado). La búsqueda global (Cmd+K) encuentra tarjetas por título.
- [x] MCP (mismo PR, por el principio "módulo nuevo → herramienta MCP"):
  `listar_tareas`, `ficha_tarea`, `crear_tarea`, `actualizar_tarea`,
  `mover_tarea` y `comentar_tarea`, más las tarjetas en `buscar`. Es el primer
  módulo donde el MCP puede **editar** (el tablero está pensado para que lo
  opere un agente); el borrado sigue siendo solo de la UI.
- [x] En producción (2026-07-29): PR #15 mergeado (`66e5305`), deploy de Vercel
  en verde y migración aplicada en el SQL Editor. Verificado contra la base
  real: `tareas` y `tareas_comentarios` existen con todas sus columnas y RLS
  activa (con la anon key sin sesión devuelven `[]`); `/tareas` en producción
  redirige a login.
- [ ] Verificación end-to-end pendiente: crear una tarjeta desde la UI y otra
  por MCP. Lo segundo no se pudo hacer en la sesión que escribió las tools —
  el cliente lista las herramientas del server **al conectarse**, así que las 6
  nuevas no aparecen hasta reconectar el conector o abrir sesión nueva.

#### Tablero v2 — Backlog separado y vistas por cliente/proyecto (2026-07-29)

Decidido tras evaluar (de nuevo) un Jira real para desarrollo de producto: la
fricción no era "falta Jira" sino dos features — el backlog mezclado con el
tablero y la falta de vistas por cliente/proyecto. Se agregaron al tablero
propio en lugar de partir la gestión en dos herramientas.

- [x] Estado nuevo `por_hacer` (migración `20260729000001_tarea_por_hacer.sql`,
  solo amplía el check constraint; las tarjetas en `backlog` no se migran). El
  tablero pasa a Por hacer / En curso / En revisión / Hecho.
- [x] Vista Backlog (`/tareas?vista=backlog`): lista priorizada con drag para
  reordenar y botón "Al tablero" (manda a `por_hacer`, al tope). Estilo Jira:
  el backlog son ideas sin comprometer, el tablero es trabajo comprometido.
- [x] Filtros por cliente, proyecto (cascada) y responsable, en la URL
  (compartible) y aplicados en la query del server (los índices parciales ya
  existían). La columna Hecho muestra solo los últimos 14 días.
- [x] Cascada cliente → proyecto también en el formulario de tarjeta (antes se
  podía guardar un proyecto de otro cliente).
- [x] Deep link `?tarea=ZQ-N`: abre el diálogo de la tarjeta (y fuerza la
  vista Backlog si corresponde). Lo usan la búsqueda global, "Mis tareas" del
  home y las fichas.
- [x] Fichas de cliente y proyecto: sección "Tareas" con las abiertas y link
  "Ver en tablero" ya filtrado.
- [x] Fix: editar la columna desde el diálogo ahora recalcula `orden` (antes
  la tarjeta heredaba el orden de la columna vieja; el MCP ya lo hacía bien).
- [x] MCP (mismo PR): `por_hacer` en los enums, `listar_tareas` acepta
  `proyecto_nombre`, y tool nueva `priorizar_tarea` (reordena dentro de la
  columna: `antes_de`/`despues_de` otra tarjeta o `posicion` tope/fondo) —
  antes un agente solo podía mandar al tope con `mover_tarea`.
- [ ] Release: PR abierto → merge → migración en SQL Editor (Joaquín) →
  verificación en prod (UI + tools nuevas desde sesión/conector nuevo).

#### Tablero v3 — Brief de desarrollo (2026-07-29)

Objetivo: que cada tarjeta tenga un formato que un LLM pueda leer y resolver
de la mejor manera, y que se pueda crear con lo mínimo (título) para que un
agente la desarrolle después. Mismo patrón que el one-pager de ideas.

- [x] Brief de 4 campos en `tareas` (migración `20260729000002_brief_tareas.sql`):
  `contexto` (por qué existe), `resultado` (criterios de aceptación
  verificables), `recursos` (links/docs/accesos con URLs concretas) y `plan`
  (pasos accionables). Mapa `BRIEF_TAREA` en dominio.ts compartido por
  detalle, formulario y MCP.
- [x] Historial `tareas_versiones` (snapshot jsonb explícito con autor, como
  `ideas_versiones`): versionan las ediciones de contenido (UI y MCP), no los
  movimientos de columna/orden. Visible plegado en el diálogo de la tarjeta.
- [x] UI: brief como grid de secciones en el diálogo; si está vacío, aviso
  didáctico ("Pedile a Claude «desarrollá ZQ-N»") y punto ámbar en la tarjeta
  (tablero y backlog) para ver de un vistazo qué falta desarrollar. En el
  formulario el brief va colapsado (normalmente lo completa Claude).
- [x] MCP: `crear_tarea`/`actualizar_tarea` aceptan el brief (cada campo con
  su pregunta como descripción) y guardan snapshot; `ficha_tarea` devuelve
  brief + versiones y le enseña al agente resolvedor a seguir `plan` y
  verificar contra `resultado`; `listar_tareas` expone `desarrollada:
  boolean` sin inflar el payload. **Prompt `desarrollar_tarea`** (espejo de
  `bajar_idea_a_tierra`): busca contexto en el backoffice antes de preguntar,
  entrevista de a una pregunta, guarda incremental, propone partir tarjetas
  grandes, comenta el cierre y pregunta antes de mover de backlog.
- [ ] Release: PR → merge → migración en SQL Editor (Joaquín) → verificación
  en prod (UI + prompt desde conector reconectado).
- [x] Ajuste 2026-07-31, salido de revisar la graduación: "desarrollada" pasa a
  significar **tiene `resultado`**, no "tiene algún campo del brief". El
  resultado es lo que vuelve la tarjeta verificable (es contra eso que un
  agente chequea si terminó), así que sin él tener contexto no alcanza. Las
  tarjetas que salen de graduar una idea nacen justo así —contexto sí,
  criterios no— y antes quedaban marcadas como listas: eran las que más
  necesitaban `desarrollar_tarea` y el tablero las declaraba resueltas.
  Alcanza al punto ámbar, al flag `desarrollada` del MCP y a las
  descripciones de las tools; el diálogo avisa cuando el brief está a medias.

#### Tablero v4 — Campos de planificación (2026-08-15)

- [x] Migración `20260815000001_planificacion_tareas.sql`: `codigo_proyecto`
  (US-014 / DEF-07 / SC-3 / TEC-2, único por proyecto), `estimacion`
  (Fibonacci), `moscow` y `epica` (EP-N). Vienen del contrato del plugin
  `zquare` con el backoffice; sin ellos no se puede calcular la capacidad de
  un sprint. Sección "Planificación" plegada en el formulario y en el MCP.

#### Tablero v5 — Sprints (2026-08-18)

Pedido de Joaquín: gestionar sprints como en Jira — armar un sprint con
tarjetas y, al terminarlo, que el tablero quede limpio. Hasta acá el tablero
era un flujo continuo (Hecho se limpiaba solo por edad).

- [x] Migración `20260818000001_sprints.sql`: tabla `sprints` (`numero` →
  "Sprint N", nombre, objetivo, estado planificado / activo / cerrado, fechas,
  foco opcional en un proyecto, `metadata.resumen` al cerrar) + columna
  `tareas.sprint_id`. **Un solo sprint activo a la vez** (índice parcial
  único): el tablero de la empresa es uno solo.
- [x] Reglas de coherencia columna ↔ sprint en `src/lib/sprints.ts`
  (compartido por server actions y MCP): las tarjetas de un sprint
  **planificado** siguen en `backlog` (vista Backlog, agrupadas bajo el
  sprint); **iniciar** el sprint las pasa a Por hacer conservando el orden;
  una tarjeta que entra al tablero sin sprint se suma sola al activo; volver
  a `backlog` desde el activo la saca del sprint; a un sprint cerrado no se
  agregan tarjetas. **Completar** archiva lo hecho en el sprint (deja de
  verse en el tablero — esa es la limpieza) y manda lo pendiente al backlog o
  al sprint planificado que se elija, conservando el orden del tablero.
- [x] Vista Backlog = backlog de Jira: secciones por sprint (activo primero,
  planificados después) con métricas (tarjetas, hechas, puntos), drag & drop
  entre secciones para planificar, botón "Iniciar sprint" / "Completar
  sprint", crear/editar/eliminar sprint (solo planificados), y menú "Mover
  a…" por tarjeta. Sin sprints creados todo sigue igual que antes (botón "Al
  tablero").
- [x] Tablero: banner del sprint activo (fechas, días restantes, hechas /
  total, puntos, objetivo, "Completar sprint"); sin activo, aviso con link
  al backlog. El tablero muestra el sprint activo + lo que no tiene sprint;
  las tarjetas de sprints cerrados no aparecen. Select "Sprint" en el
  formulario de tarjeta y dato "Sprint" en el detalle.
- [x] MCP: `listar_sprints`, `crear_sprint`, `mover_a_sprint`,
  `iniciar_sprint`, `completar_sprint`; `listar_tareas` filtra por `sprint`
  (número o "activo") / `sin_sprint` y devuelve el sprint de cada tarjeta;
  `crear_tarea` acepta `sprint`; `mover_tarea` / `actualizar_tarea` aplican
  las mismas reglas de coherencia que la UI.
- [ ] Release: PR → merge → migración en SQL Editor (Joaquín) → verificación
  en prod (UI + tools nuevas desde conector reconectado).

### Post-MVP — Calendario de reuniones
- [x] Panel "Próximas reuniones" en el dashboard: agenda unificada de los 4
  socios (próximos 7 días) leída de sus Google Calendars vía la cuenta de
  servicio. Las invitaciones de Zoom/Teams/Meet que mandan los clientes llegan
  por mail, Google Calendar las agrega solo y el panel las muestra con botón
  para unirse (detecta el proveedor por el link). Eventos duplicados entre
  calendarios se unifican por iCalUID. (Código deployado el 2026-07-24.
  Setup 2026-07-27: Calendar API habilitada y 3 de 4 calendarios compartidos;
  falta solo que Nicolás comparta el suyo con la cuenta de servicio.)

### Post-MVP — Banco de ideas *(iterar ideas con Claude vía MCP)*
- [x] Decisión 2026-07-29 (bajada a tierra con Claude, con el flujo que el
  propio módulo automatiza): las ideas de los socios viven en el backoffice y
  maduran conversando con Claude. La iteración ocurre **fuera** (claude.ai /
  Claude Code, vía el conector MCP existente), no con un chat embebido: más
  barato y aprovecha lo ya construido. Diseño acordado:
  - **Captura por ambos lados:** alta rápida desde la UI (título + una línea,
    estado `semilla`) o desde una conversación con Claude vía MCP.
  - **One-pager estructurado:** problema, solución propuesta, esfuerzo
    estimado, impacto esperado y próximos pasos, más descripción libre y
    etiquetas. Comparable entre ideas y filtrable.
  - **Ciclo de vida:** semilla → en exploración → lista → aprobada /
    descartada. Una idea aprobada se convierte en proyecto o tareas del
    kanban con trazabilidad (etapa de graduación).
  - **Colaboración:** comentarios (mismo patrón que tareas), votos (+1 por
    socio) y co-edición con historial de versiones (snapshot por edición,
    con autor — socio o Claude).
  - **Prompt MCP `bajar_idea_a_tierra`:** entrevista estándar servida por el
    server MCP para que los 4 socios iteren igual sin saber "cómo preguntar".
- [x] Etapa 1 — migración `ideas` (+ versiones, comentarios, votos) y página
  `/ideas`: lista por estado, captura rápida, detalle con one-pager,
  comentarios, votos e historial. **En producción el 2026-07-29** (PR #17
  mergeado, migración `20260729000001_ideas.sql` aplicada en el SQL Editor;
  verificado contra la base real: las 4 tablas responden 200+`[]` con la anon
  key — esquema completo y RLS activa — y `/ideas` redirige a login).
- [x] Etapa 2 — MCP en el mismo PR (principio "módulo nuevo → herramienta
  MCP"): `listar_ideas`, `ficha_idea`, `crear_idea`, `actualizar_idea`,
  `comentar_idea`, `votar_idea` + prompt `bajar_idea_a_tierra`. Ideas en
  `buscar`, en el Cmd+K y en el índice semántico (origen `idea`).
  **Verificado end-to-end el 2026-07-29** tras reconectar el conector (el
  límite conocido: las tools nuevas recién aparecen al reconectar): IDEA-1
  capturada desde la UI y leída por MCP con `listar_ideas` y `ficha_idea`,
  con snapshot v1 en el historial y autor atribuido.
- [x] Mejora 2026-07-29 (pedida por Joaquín tras la primera entrevista real):
  **análisis de competencia** como sección propia del one-pager — en IDEA-1
  la competencia apareció igual pero quedó mezclada dentro del problema.
  Migración `20260729000002` (columna `competencia`), campo en UI y MCP, y
  paso 2 nuevo en la entrevista del prompt: Claude investiga quién lo
  resuelve hoy (con búsqueda web si está disponible), qué cobran, y el campo
  cierra con nuestro diferencial — o la advertencia honesta de que no lo hay.
- [x] Etapa 3 — graduación (2026-07-30): una idea aprobada se convierte en
  trabajo real. Quien gradúa elige el destino: **proyecto interno** (con
  tareas iniciales opcionales colgando de él) para ideas grandes, o **tareas
  sueltas** del kanban para ideas chicas. Migración `20260730000001`:
  `proyectos.cliente_id` pasa a nullable (null = proyecto interno de ZQUARE).
  Trazabilidad en ambos sentidos: la idea guarda `proyecto_id` +
  `metadata.graduacion` (destino, fecha, tareas ZQ-N) y se muestra en su
  detalle; cada tarea nace arriba del backlog con etiqueta `IDEA-N` y el
  `contexto` del brief apuntando a la idea. Implementado como botón
  "Graduar" en la UI y herramienta MCP `graduar_idea`; el prompt de la
  entrevista menciona la graduación como cierre del ciclo.
- [x] Rollback de la graduación (2026-07-30): botón "Deshacer" en la franja de
  trazabilidad y herramienta MCP `deshacer_graduacion`. Archiva (soft delete)
  el proyecto y las tareas generadas, limpia `proyecto_id` y
  `metadata.graduacion`, y devuelve la idea a `lista` con su one-pager
  intacto; queda registrado en el historial. La franja solo se muestra
  mientras la idea esté aprobada y el proyecto vivo.
- [x] Cierre de la trazabilidad en la UI (2026-07-31): la ficha de un proyecto
  interno muestra "Graduado de IDEA-N · título" con link a la idea. El dato ya
  estaba (la idea guarda `proyecto_id`), pero solo se veía de ida.
- [ ] Etapa 4 — matriz impacto × esfuerzo para priorizar de un vistazo, y
  afinado de la entrevista del prompt según el uso real.

### Post-MVP — Proyectos e inicializador *(2026-08-17)*

Objetivo: que empezar un proyecto deje de depender de quién lo vendió. Hasta
ahora `proyectos` guardaba solo lo comercial (montos, fechas, horas) y no
tenía ni listado propio ni tools MCP; todo lo que hace falta para *empezar a
trabajar* vivía en la cabeza de alguien o disperso en Drive. Tercera pata del
mismo patrón que el one-pager de ideas y el brief de tarjetas: leer lo que el
backoffice ya sabe, entrevistar solo por lo que falta, guardar el resultado.

- [x] Migración `20260817000001_inicializador_proyectos.sql`: `responsable_id`
  (socio a cargo — el filtro "mis proyectos" que faltaba), `tipo`
  (desarrollo / integracion / mantenimiento / interno), **brief de arranque**
  de 9 campos (objetivo, alcance, fuera_de_alcance, stakeholders,
  stack_y_repos, entornos_y_accesos, riesgos, definicion_de_hecho, hitos),
  `kickoff_completado_at` + `kickoff_por`, y `proyectos_versiones` (snapshot
  explícito con autor, igual que ideas y tareas). El kickoff es un hecho
  aparte del estado comercial a propósito: un proyecto puede estar `en_curso`
  porque el cliente firmó y no haberse arrancado nunca como corresponde, y
  ese hueco es justo lo que el listado tiene que mostrar.
- [x] Pestaña **Proyectos** (`/proyectos`, en el sidebar): agrupada por estado,
  con una sección "Esperando arranque" arriba de todo (es la pregunta que
  trae a alguien a esta pantalla). Filtros en la URL: estado, cliente,
  responsable, tipo, salud y arranque. **Salud** derivada de las fechas, nunca
  editada a mano (atrasado / vence pronto / al día / sin fecha) — primer
  insumo del estimador de la Fase 4.
- [x] Brief en la ficha del proyecto: grid de secciones (los 4 del mínimo se
  muestran aunque estén vacíos), edición manual en diálogo y atajo "Trabajarlo"
  por sección que abre claude.ai con el prompt precargado (mismo mecanismo que
  los atajos del banco de ideas).
- [x] MCP: `listar_proyectos` (con `comenzado: boolean`), `ficha_proyecto`
  (brief + presupuestos + documentos + decisiones + tareas + idea de origen,
  más `campos_brief_faltantes` y `precondiciones`), `actualizar_proyecto` con
  versionado y `comenzar_proyecto` (tool atómica que cierra el arranque y se
  niega si falta el brief mínimo, el tipo o el responsable). `crear_decision`
  acepta ahora `proyecto_nombre` y hereda el cliente del proyecto.
- [x] **Prompt `comenzar_proyecto`**: lee ficha + documentos + cliente + idea
  de origen ANTES de preguntar, avisa las precondiciones que faltan
  (presupuesto aprobado, contrato, monto, responsable), entrevista de a una
  pregunta proponiendo su borrador, y cierra creando los insumos — tareas de
  setup TEC-N según el tipo, primeras historias US-N agrupadas por épica (sin
  estimación: los puntos los pone el equipo) y decisiones de arranque.
- [x] Release: PR #32 mergeado el 2026-08-17 y migración aplicada por Joaquín
  el mismo día (las 13 columnas nuevas verificadas contra
  `information_schema`).
- [ ] **Bloqueado: no llegó a producción.** La integración de Vercel con
  GitHub dejó de generar deployments desde el 2026-08-16 (último Production:
  `7e75bc0`, del 15/8; el merge `640d0c6` no disparó ninguno, ni siquiera un
  Preview al pushear la rama). La GitHub App sigue instalada y sin suspender,
  así que la causa está del lado de Vercel — sospecha principal: límite del
  plan Hobby, que además es formalmente para uso no comercial (ver "Cuentas y
  secretos"). Pendiente mirar el dashboard; mientras tanto se puede deployar a
  mano con `npx vercel --prod`. La verificación en prod (UI + prompt desde el
  conector reconectado) queda detrás de esto.
- [x] Segunda tanda de ajustes (2026-08-17): los atajos a Claude **copian el
  prompt al portapapeles** en vez de abrir claude.ai — la conversación puede
  querer arrancarse en la app de escritorio, en un proyecto con más contexto o
  en Claude Code, y esa elección es de quien arranca, no del backoffice. El
  sidebar se agrupó en Desarrollo (Proyectos · Tareas · Ideas) y Gestión
  (Clientes · Documentos · Finanzas · Decisiones). Toda la tarjeta del listado
  entra al proyecto, no solo el título.
- [ ] Simetría pendiente: **`cerrar_proyecto`** — retro guiada que llena
  `fecha_fin_real` / `horas_reales` y deja una decisión de aprendizaje. El
  inicializador sin cierre deja al estimador sin los datos que justifican
  haber guardado estimado vs. real.

### Post-MVP — Documentos: Drive como fuente de verdad *(2026-08-17)*

`/documentos` mostraba **un** documento teniendo Drive lleno. No era un bug:
la tabla nació en la fase 1 con un enfoque híbrido (los archivos en Drive, acá
la metadata para catalogarlos) que tenía sentido cuando el sistema no podía
saber qué había en Drive. Cuatro días después la búsqueda semántica trajo
`listarTodosLosArchivos()`, que recorre la unidad entera: la premisa dejó de
ser cierta y quedaron **dos catálogos que ni se conocían** — la tabla guardaba
`drive_url` y el índice el file id, así que ni siquiera se podían unir sin
parsear la URL.

- [x] Migración `20260817000002_documentos_drive.sql`: `drive_file_id` con
  backfill desde la URL, único parcial, y `cliente_id` nullable (un archivo
  suelto puede merecer un tipo sin ser de nadie). La tabla pasa a ser
  **anotaciones sobre archivos de Drive**, no el catálogo.
- [x] `/documentos` lista lo que hay en Drive y superpone la ficha cuando
  existe. Cliente y proyecto se **infieren de la carpeta** (cruzando la cadena
  de padres contra `drive_folder_id` de clientes y proyectos, la carpeta más
  profunda gana); lo anotado a mano manda sobre lo inferido. Filtros en el
  cliente (texto, cliente, tipo, "sin ficha") porque los archivos ya vinieron
  todos: recorrer Drive es la parte cara y se hace una vez.
- [x] Anotar desde la lista: diálogo con tipo, cliente, proyecto, fecha y tags,
  precargado con lo inferido. Las fichas cuyo archivo ya no está en Drive se
  muestran aparte en vez de desaparecer.
- [ ] Pendiente: la ficha de cliente sigue listando solo lo anotado (tiene el
  navegador de Drive al lado, así que no urge), y el MCP no expone las fichas
  —`buscar` ya llega al contenido de todos los archivos igual.

### Pendiente — Identidad visual *(esperando a la diseñadora)*
- [ ] Rediseño de la UI del backoffice: pedido explícito de Joaquín desde el
  arranque — que NO se vea como una UI genérica generada por IA (hoy usa el
  tema default de shadcn sin personalizar). Decisión 2026-07-27: esperar la
  imagen de marca de la diseñadora (seña pagada, entrega pendiente) y aplicar
  esa identidad (paleta, tipografías, logo) al backoffice y a la web pública
  en un mismo pase, para que todo ZQUARE sea coherente.
- [ ] Web pública zquare.uy: misma espera — arrancarla directo con el diseño
  de marca, no con un diseño provisorio.

### Fase 4 — Herramientas con IA *(backlog, cuando haya datos)*
- [x] MCP server del backoffice (2026-07-27, funcionando en producción): endpoint remoto en
  `/api/mcp/mcp` (Streamable HTTP vía mcp-handler) para hablar con los datos
  desde Claude Code/Desktop. 8 herramientas: buscar (literal+semántica),
  listar/ficha de clientes, resumen de finanzas, movimientos, decisiones, y
  altas de decisión/movimiento (sin ediciones ni borrados). Auth por token
  bearer por socio (`MCP_TOKENS`); usa la service role key. Env vars cargadas,
  verificado end-to-end y tokens repartidos a los socios el 2026-07-27.
  **Principio de desarrollo (2026-07-28):** las herramientas MCP se definen a
  mano (qué se expone y qué se puede escribir es una decisión, no un reflejo
  automático de la DB) → cada módulo nuevo del backoffice debe sumar su
  herramienta MCP en el mismo PR, para que Claude nunca quede desactualizado
  respecto de lo que el backoffice sabe hacer. Los datos y columnas nuevas de
  entidades ya expuestas sí se ven solos, sin tocar nada.
- [x] OAuth 2.1 para el MCP (2026-07-28): permite conectar el backoffice como
  conector en claude.ai web/celular (que no acepta tokens pegados a mano).
  El backoffice actúa de authorization server completo: discovery
  (`/.well-known/oauth-authorization-server` y `oauth-protected-resource`),
  registro dinámico de clientes (RFC 7591), consentimiento en
  `/oauth/autorizar` (usa la sesión de Google + allowlist de socios) y
  `/api/oauth/token` con PKCE S256 obligatorio y refresh tokens con rotación.
  Tokens opacos guardados hasheados (sha256) en `mcp_oauth_*`; los tokens
  estáticos de MCP_TOKENS siguen funcionando igual que antes.
  **En producción desde el 2026-07-28:** migración aplicada, PR #12 mergeado
  y Joaquín conectado desde claude.ai (PC y celular). Cada socio lo agrega en
  su propia cuenta de claude.ai (requiere plan pago): Configuración →
  Conectores → "Añadir conector personalizado", nombre libre, URL
  `https://backoffice.zquare.uy/api/mcp/mcp`, campos de OAuth vacíos →
  Conectar → autorizar con la cuenta @zquare.uy. En el celular aparece solo
  (misma cuenta). Instrucciones repartidas a los 3 socios el 2026-07-28;
  pendiente que cada uno se conecte. Quien use cuenta free de claude.ai
  sigue con su token estático en Claude Code/Desktop.
- [ ] Generador de presupuestos: a partir del histórico de `presupuesto_items`, la IA sugiere ítems, horas y tarifas para un nuevo presupuesto
- [ ] Plantillas de contratos: base editable + generación de variantes
- [ ] Estimador de alcance y tiempos: usa horas estimadas vs. reales de proyectos pasados
- [x] Búsqueda semántica sobre documentos y decisiones ("repositorio de
  información"): implementada el 2026-07-27 con pgvector; indexa el contenido
  real de los archivos de Drive (Google Docs/Sheets/Slides, docx, pdf, txt) y
  las decisiones; resultados en el Cmd+K (grupo "Contenido") y gestión del
  índice en /documentos.
  **Embeddings multilingües (2026-07-28):** migrada de gte-small (Edge
  Function de Supabase, solo inglés — rankeaba mal el español) a **bge-m3
  vía Cloudflare Workers AI** (1024 dims, multilingüe, capa gratis de 10k
  neurons/día — costo cero a nuestro volumen). Verificado con el corpus real:
  el doc correcto rankea primero en consultas en español (antes similitudes
  ~0.8 parejas; ahora aciertos ~0.47-0.61 vs ruido ~0.41-0.54, umbral del
  Cmd+K calibrado en 0.45). Env vars: `CLOUDFLARE_ACCOUNT_ID` +
  `CLOUDFLARE_AI_TOKEN` (cuenta gratis de Cloudflare). La Edge Function
  `embeddings` quedó obsoleta (borrada del repo; se puede eliminar del
  dashboard de Supabase). Requiere migración `20260728000002` + reindexar
  desde /documentos.
  **Reindexado automático (2026-07-28):** cron diario de Vercel (6:00 UTC,
  `vercel.json`) que llama a `/api/cron/reindexar` (auth por `CRON_SECRET`
  en Vercel) y reindexa solo lo modificado en Drive y decisiones — el Cmd+K
  se mantiene al día sin tocar "Actualizar índice" (el botón sigue para
  reindexar al instante).

## 7. Seguridad y acceso

- Solo los 4 mails @zquare.uy pueden entrar (allowlist en DB + RLS en todas las tablas).
- Nada de datos sensibles en el cliente: mutaciones vía Server Actions con validación.
- Supabase hace backups automáticos diarios (plan free: 7 días de retención).

## 8. Costos estimados

| Concepto | Costo |
|---|---|
| Supabase Free (500 MB DB) | 0 USD — alcanza de sobra para 4 usuarios |
| Vercel Hobby | 0 USD — *ojo: el plan Hobby es formalmente para uso no comercial; si quieren estar 100% en regla es Pro (20 USD/mes) o migrar el hosting a Cloudflare (gratis)* |
| Google Workspace | Ya lo pagan |
| API de Claude (fase 4) | Pocos USD/mes según uso |

## 9. Próximo paso

Arrancar la **Fase 0**: crear el proyecto Next.js, el proyecto en Supabase
(crear cuenta en supabase.com con un mail de zquare.uy) y configurar el OAuth
de Google en la consola del Workspace.

## 10. Historial de cambios

- **2026-07-22** — v1 inicial: decisiones de stack, modelo de datos y fases
  acordadas con Joaquín. Punto de partida, sujeto a revisión.
- **2026-07-22** — v1.1: principios de diseño de la base de datos (sección 4):
  esquema limpio y evolutivo, migraciones versionadas, soft delete,
  estructura + texto pensados como input de IA.
- **2026-07-22** — v1.2: sección de uso simple y consistente (sección 5):
  fichas estándar, búsqueda global, plantilla de carpetas Drive creada
  automáticamente por el sistema. Pendiente: estructura actual de Drive de
  Joaquín para ajustar la plantilla.
- **2026-07-23** — Fase 0 completada y desplegada: repo en GitHub
  (ZQUARE-UY/backoffice, público), deploy en Vercel Hobby, login con Google
  funcionando end-to-end en producción. Pendientes menores: DNS del subdominio
  e invitar a los socios a GitHub.
- **2026-07-23** — v1.3: plantilla de carpetas Drive confirmada (basada en la
  estructura real de "Cognitiva") y decisión de usar Drive como nube del
  sistema vía API (carpetas automáticas, listado en vivo, subida de archivos),
  con migración a Unidad compartida ZQUARE.
- **2026-07-24** — Fase 2 etapa 1: módulo de Finanzas. Movimientos
  multi-moneda (ingreso/gasto/aporte/retiro) con tipo de cambio y consolidado
  en USD, categorías sugeridas, comprobante como link a Drive, y balance entre
  socios (aporte neto vs. promedio). Migración aplicada y desplegada a
  producción (PR #1). Seña de la diseñadora cargada (gasto + aporte de Joaquín).
  Pendiente: montos de Martín (dominio + Workspace) para completar históricos.
- **2026-07-27** — Migración de "Cognitiva" (carpeta "ZQUARE" de Alan) a la
  unidad compartida, vía API con la cuenta de servicio. Mapeo: minutas →
  Empresa/Minutas internas; plantillas de contrato → Empresa/Plantillas;
  Iberpark (Presupuestos + proyectos Modelo Sommelier y Sistema contabilidad),
  Punta Del Este Operadora (= PEO, proyecto PEO) y Pedro Montero (Voice to
  image) → Clientes/ con estructura estándar.
  LandingPage (web propia, vacía) → Empresa/. Google Docs migrados por
  export+reimport (Gmail de Alan sin cuota).
- **2026-07-27 (2)** — Búsqueda semántica (Fase 4 etapa 1) con pgvector +
  gte-small, operativa con limitación en español anotada. MCP server remoto
  del backoffice (8 herramientas, tokens por socio) funcionando en producción
  y repartido a los socios. Navegación de carpetas de Drive dentro de la app
  y vista previa de documentos en modal (visor embebido de Google). Decisión:
  identidad visual (backoffice + web) espera la entrega de la diseñadora.
- **2026-07-28** — Reindexado automático: cron diario de Vercel que mantiene
  el índice de búsqueda al día (solo procesa lo modificado).
- **2026-07-28** — Embeddings multilingües: la búsqueda semántica pasa de
  gte-small a bge-m3 (Cloudflare Workers AI, capa gratis). Verificado con el
  corpus real: consultas en español ahora rankean el doc correcto primero.
- **2026-07-28** — OAuth 2.1 para el MCP server: conexión desde claude.ai
  web/celular vía conector personalizado, con consentimiento sobre la sesión
  de Google de cada socio. Desplegado y funcionando en producción el mismo
  día (PR #12 mergeado, migración aplicada, Joaquín conectado desde PC y
  celular, instrucciones repartidas a los otros 3 socios). Además: principio
  de desarrollo "módulo nuevo → herramienta MCP en el mismo PR".
- **2026-07-24** — Fase 3: Dashboard en la home. Métricas de ingresos/gastos/
  resultado (USD), clientes activos, proyectos en curso y por estado; evolución
  mensual (barras CSS, sin librerías de gráficos) y balance de socios (componente
  compartido con Finanzas).
- **2026-07-29** — Banco de ideas: diseño acordado (iteración vía MCP con
  prompt guía, one-pager estructurado, ciclo de vida con graduación a
  proyecto/tareas, comentarios + votos + co-edición con historial) e
  implementación de las etapas 1 y 2 (migración, página /ideas y herramientas
  MCP). Mergeado (PR #17), migración aplicada y verificado end-to-end el
  mismo día — primera idea real cargada (IDEA-1). Ver la sección "Post-MVP —
  Banco de ideas".
- **2026-07-28/29** — Tablero de tareas propio (kanban) en lugar de integrar
  Jira: tarjetas en Supabase con código corto `ZQ-N`, drag & drop, comentarios,
  y 6 herramientas MCP para que los LLM lean, creen, editen, muevan y comenten
  tarjetas — el primer módulo donde el MCP escribe sobre datos existentes.
  Mergeado (PR #15) y deployado el 2026-07-29 con la migración aplicada; queda
  la verificación end-to-end de UI y MCP. Ver la sección "Post-MVP — Tablero de
  tareas".
- **2026-07-29** — Tablero v2: backlog separado del tablero (estado nuevo
  `por_hacer` + vista Backlog priorizable), filtros por cliente/proyecto/
  responsable en la URL, tareas en las fichas de cliente y proyecto, deep link
  `?tarea=ZQ-N`, y `priorizar_tarea` en el MCP. Se reevaluó usar un Jira real
  para producto y se ratificó el tablero propio: lo que faltaba eran estas dos
  features, no otra herramienta.
- **2026-07-29** — Tablero v3: brief de desarrollo por tarjeta (contexto /
  resultado / recursos / plan) para que un LLM pueda leerla y resolverla sin
  más contexto; creación con campos mínimos + prompt MCP `desarrollar_tarea`
  que entrevista al socio y completa el brief; historial `tareas_versiones`
  con autoría humano/agente; indicador "sin desarrollar" en el tablero.
  Patrón calcado del one-pager del banco de ideas.
- **2026-07-31** — Revisión de la graduación: "desarrollada" pasa a exigir
  `resultado` (antes bastaba cualquier campo del brief, así que las tareas
  recién graduadas —contexto sí, criterios no— se mostraban como listas justo
  cuando eran las que más necesitaban `desarrollar_tarea`), y la ficha del
  proyecto interno ahora linkea a la idea que lo originó.
- **2026-08-18** — Tablero v5: sprints al estilo Jira sobre el mismo tablero
  (tabla `sprints` + `tareas.sprint_id`, uno activo a la vez). Se planifica en
  la vista Backlog arrastrando tarjetas a un sprint, se inicia (entran a Por
  hacer) y se completa: lo hecho queda archivado en el sprint y desaparece del
  tablero, lo pendiente vuelve al backlog o pasa al siguiente. Cinco tools MCP
  nuevas y filtro por sprint en `listar_tareas`. Ver "Tablero v5 — Sprints".
- **2026-08-21** — Reuniones: grabación y transcripción. Desde la página de la
  reunión se graba el audio (micrófono, y en videollamadas también el audio de
  la pestaña del Meet compartida, mezclados en el navegador) o se sube un
  archivo ya grabado. El audio va directo a Drive en partes de ~15 min
  (subida resumable), se transcribe con Whisper en Cloudflare Workers AI
  (mismo token que los embeddings, sin credenciales nuevas) y la transcripción
  final queda como Google Doc en Minutas/ del cliente (o Reuniones/ si es
  interna) — el indexador semántico la levanta solo en la pasada siguiente.
  Tabla nueva `reunion_grabaciones` (una fila por parte, reintentable),
  columnas `drive_transcripcion_id/url` en la solicitud, y tool MCP
  `transcripcion_reunion` para resumir o sacar tareas/decisiones de lo
  hablado. Indiferente de la plataforma (Meet/Zoom/presencial): no depende
  del plan de Workspace.
