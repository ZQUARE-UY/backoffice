# Plan de desarrollo — Backoffice ZQUARE

> Plataforma interna de gestión para los 4 socios de ZQUARE (zquare.uy).
>
> **Documento vivo.** Esto es la versión 1 de una idea que va a evolucionar:
> nada de lo escrito acá es definitivo. Cualquier módulo, prioridad o decisión
> se puede cambiar en cualquier momento — se actualiza este documento y se
> registra en el historial de cambios al final. Última actualización: 2026-07-28.

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

### Post-MVP — Calendario de reuniones
- [x] Panel "Próximas reuniones" en el dashboard: agenda unificada de los 4
  socios (próximos 7 días) leída de sus Google Calendars vía la cuenta de
  servicio. Las invitaciones de Zoom/Teams/Meet que mandan los clientes llegan
  por mail, Google Calendar las agrega solo y el panel las muestra con botón
  para unirse (detecta el proveedor por el link). Eventos duplicados entre
  calendarios se unifican por iCalUID. (Código deployado el 2026-07-24.
  Setup 2026-07-27: Calendar API habilitada y 3 de 4 calendarios compartidos;
  falta solo que Nicolás comparta el suyo con la cuenta de servicio.)

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
