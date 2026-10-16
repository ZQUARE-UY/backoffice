-- Contenido editable de la web (zquare.uy) desde la sección Web del
-- backoffice. La web lo lee de la ruta pública /api/publico/contenido y, si
-- falla, usa el texto que tiene escrito en su propio HTML.
--
-- Un bloque es un servicio, un paso del método o un testimonio, con su texto
-- en español y en inglés (jsonb con los mismos campos en `es` y `en`):
--   servicio:   { titulo, descripcion, etiqueta }  (etiqueta = chip del formulario)
--   paso:       { titulo, duracion, descripcion }
--   testimonio: { cita, cargo }  + nombre y empresa, que no se traducen
-- El equipo sale de los socios (columnas web_* más abajo).

create table public.contenido_web (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('servicio', 'paso', 'testimonio')),
  orden integer not null default 0,
  publicado boolean not null default true,
  es jsonb not null default '{}',
  en jsonb not null default '{}',
  nombre text,
  empresa text,
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index contenido_web_tipo_idx on public.contenido_web (tipo, orden) where deleted_at is null;

create trigger contenido_web_updated_at
  before update on public.contenido_web
  for each row execute function public.set_updated_at();

alter table public.contenido_web enable row level security;

create policy "socios operan contenido_web"
  on public.contenido_web for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete on public.contenido_web to service_role;

-- Equipo de la web: qué socios aparecen, en qué orden y con qué cargo.
alter table public.socios
  add column web_visible boolean not null default false,
  add column web_orden integer not null default 0,
  add column web_cargo_es text,
  add column web_cargo_en text;

grant select on public.socios to service_role;

-- Punto de partida: lo que la web muestra hoy. Los testimonios son de
-- ejemplo (así vino el diseño): hay que reemplazarlos por reales.
insert into public.contenido_web (tipo, orden, es, en) values
  ('servicio', 1,
   '{"titulo":"Estrategia de IA","descripcion":"Identificamos casos de uso con retorno medible, evaluamos datos y riesgos, y definimos una hoja de ruta ejecutable.","etiqueta":"Estrategia de IA"}',
   '{"titulo":"AI strategy","descripcion":"We identify use cases with measurable return, assess data and risk, and define an actionable roadmap.","etiqueta":"AI strategy"}'),
  ('servicio', 2,
   '{"titulo":"Agentes y automatización","descripcion":"Agentes basados en LLM integrados a tus herramientas y procesos, con evaluación y monitoreo continuo.","etiqueta":"Agentes"}',
   '{"titulo":"Agents & automation","descripcion":"LLM-based agents integrated with your tools and processes, with continuous evaluation and monitoring.","etiqueta":"Agents"}'),
  ('servicio', 3,
   '{"titulo":"Desarrollo a medida","descripcion":"Aplicaciones web, móviles y backends construidos con prácticas de ingeniería sólidas y entregas frecuentes.","etiqueta":"Software a medida"}',
   '{"titulo":"Custom development","descripcion":"Web, mobile and backend applications built with solid engineering practices and frequent releases.","etiqueta":"Custom software"}'),
  ('servicio', 4,
   '{"titulo":"Datos e integración","descripcion":"Pipelines, APIs y arquitectura de datos para que los modelos trabajen sobre información confiable.","etiqueta":"Datos"}',
   '{"titulo":"Data & integration","descripcion":"Pipelines, APIs and data architecture so models work on reliable information.","etiqueta":"Data"}'),
  ('paso', 1,
   '{"titulo":"Diagnóstico","duracion":"1–2 semanas","descripcion":"Relevamos procesos, datos y restricciones. Priorizamos por impacto y factibilidad."}',
   '{"titulo":"Discovery","duracion":"1–2 weeks","descripcion":"We map processes, data and constraints, then prioritize by impact and feasibility."}'),
  ('paso', 2,
   '{"titulo":"Prototipo","duracion":"2–4 semanas","descripcion":"Validamos el caso con usuarios reales y métricas definidas antes de escalar."}',
   '{"titulo":"Prototype","duracion":"2–4 weeks","descripcion":"We validate the case with real users and defined metrics before scaling."}'),
  ('paso', 3,
   '{"titulo":"Construcción","duracion":"Sprints","descripcion":"Desarrollo iterativo con demos quincenales, código propio del cliente y documentación."}',
   '{"titulo":"Build","duracion":"Sprints","descripcion":"Iterative development with biweekly demos, client-owned code and documentation."}'),
  ('paso', 4,
   '{"titulo":"Operación","duracion":"Continuo","descripcion":"Monitoreo, evaluación de modelos y mejoras sobre el sistema en producción."}',
   '{"titulo":"Operate","duracion":"Ongoing","descripcion":"Monitoring, model evaluation and improvements on the live system."}');

insert into public.contenido_web (tipo, orden, nombre, empresa, es, en) values
  ('testimonio', 1, 'Nombre Apellido', 'Empresa A',
   '{"cita":"En seis semanas pasamos de una idea a un agente en producción que atiende el 40% de las consultas de soporte.","cargo":"Gerente de Operaciones"}',
   '{"cita":"In six weeks we went from an idea to a production agent that handles 40% of our support requests.","cargo":"Head of Operations"}'),
  ('testimonio', 2, 'Nombre Apellido', 'Empresa B',
   '{"cita":"Entendieron el negocio antes de escribir una línea de código. El roadmap que armamos juntos sigue siendo nuestra guía.","cargo":"CEO"}',
   '{"cita":"They understood the business before writing a line of code. The roadmap we built together is still our guide.","cargo":"CEO"}'),
  ('testimonio', 3, 'Nombre Apellido', 'Empresa C',
   '{"cita":"Equipo técnico sólido, entregas cada dos semanas y comunicación clara. Exactamente lo que necesitábamos.","cargo":"CTO"}',
   '{"cita":"A solid technical team, releases every two weeks and clear communication. Exactly what we needed.","cargo":"CTO"}');
