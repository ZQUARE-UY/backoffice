-- Formulario de contacto de la web: teléfono o WhatsApp (opcional) y cómo nos
-- conoció la persona (una opción de la lista del formulario, opcional).
alter table public.consultas_web
  add column telefono text,
  add column conocio text;
