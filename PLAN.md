# Plan de desarrollo — Backoffice ZQUARE

> Plataforma interna de gestión para los 4 socios de ZQUARE (zquare.uy).
>
> **Documento vivo.** Esto es la versión 1 de una idea que va a evolucionar:
> nada de lo escrito acá es definitivo. Cualquier módulo, prioridad o decisión
> se puede cambiar en cualquier momento — se actualiza este documento y se
> registra en el historial de cambios al final. Última actualización: 2026-07-22.

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
  idénticas para todos los clientes, sin excepciones. Plantilla propuesta
  (borrador, a ajustar cuando Joaquín pase la estructura actual):

```
ZQUARE (unidad compartida del Workspace)
└── Clientes/
    └── <Cliente>/
        ├── 00 - Info general/
        └── <Proyecto>/
            ├── 01 - Presupuestos/
            ├── 02 - Analisis y propuesta/
            ├── 03 - Contratos/
            ├── 04 - Documentacion tecnica/
            └── 05 - Entregables/
```

- **Pendiente:** Joaquín pasa la estructura actual de la carpeta Drive (en los
  mails personales) para ajustar la plantilla y planificar la migración al
  Workspace.

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
- [ ] Invitar a los 3 socios a la organización GitHub ZQUARE-UY

> **Notas de deploy (para no repetir tropiezos):**
> - Vercel Hobby no deploya repos privados de una organización → el repo se dejó público (no contiene secretos; `.env.local` está en gitignore). Alternativa futura si se quiere privado: Cloudflare Pages (gratis) o Vercel Pro.
> - Usar SIEMPRE la URL estable de Vercel (`backoffice-zeta-teal.vercel.app`), no las URLs con hash por-deploy. El Site URL y los Redirect URLs de Supabase apuntan a la estable.
> - Al cargar env vars en Vercel, pegar el valor en texto plano — si se copia el campo enmascarado se guardan caracteres "•" y el login falla con "Cannot convert argument to a ByteString".

### Fase 1 — Clientes y documentos *(2-3 sesiones)*
- [x] CRUD de clientes y proyectos (migración + fichas + alta guiada, verificado end-to-end el 2026-07-23)
- [x] Presupuestos con ítems por horas y versionado (editor con total en vivo, CRUD completo, verificado el 2026-07-23)
- [ ] Documentos: alta con link a Drive, tipos y tags, listado filtrable
- [ ] Creación automática de la estructura de carpetas en Drive al dar de alta cliente/proyecto
- [ ] Búsqueda global (Cmd+K)
- [ ] Registro de decisiones
- [ ] Carga de datos históricos (clientes y docs que ya tienen en Drive)
- [ ] (Opcional) Google Picker para elegir archivos de Drive desde la app

### Fase 2 — Finanzas *(2 sesiones)*
- [ ] Movimientos: ingresos, gastos, aportes y retiros, multi-moneda con TC
- [ ] Categorías de gasto/ingreso
- [ ] Balance entre socios (quién está abajo y por cuánto)
- [ ] Carga de movimientos históricos (diseñadora, dominio, Workspace)

### Fase 3 — Dashboard *(1-2 sesiones)*
- [ ] Métricas: facturación, gastos, resultado, clientes activos, proyectos por estado
- [ ] Evolución mensual y por moneda
- [ ] Vista de balance de socios

### Fase 4 — Herramientas con IA *(backlog, cuando haya datos)*
- [ ] Generador de presupuestos: a partir del histórico de `presupuesto_items`, la IA sugiere ítems, horas y tarifas para un nuevo presupuesto
- [ ] Plantillas de contratos: base editable + generación de variantes
- [ ] Estimador de alcance y tiempos: usa horas estimadas vs. reales de proyectos pasados
- [ ] Búsqueda semántica sobre documentos y decisiones ("repositorio de información")

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
