-- Reuniones: invitados externos.
--
-- Hasta ahora la única persona de afuera que podía recibir la invitación era
-- el mail principal del cliente (`invitar_cliente`). En la práctica del lado
-- del cliente van dos o tres personas, y no siempre la que figura en la ficha.
-- Se guardan mails sueltos en la solicitud; al agendar entran al evento junto
-- con los socios y el mail del cliente.

alter table public.solicitudes_reunion
  add column invitados_externos text[] not null default '{}';
