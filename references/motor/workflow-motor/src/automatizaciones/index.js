// Registro de tareas automáticas: `accion` de la plantilla → función.
// Cada función recibe { tareaId, instancia } y devuelve lo que quiera guardar en tareas.resultado.
// Si lanza un error, el worker la reintenta (hasta 3 veces).
//
// Hoy son simulaciones. Para hacerlas reales, reemplaza el cuerpo de cada una
// (generar PDF, enviar email, llamar a otra API…). El motor no cambia.

module.exports = {
  async GENERAR_CARTA_VV({ instancia }) {
    // TODO: generar el PDF de la carta con los datos de la propiedad
    return { archivo: `carta_vv_${instancia.admin_new_id}.pdf` };
  },

  async ENVIAR_CARTA_GG({ instancia }) {
    // TODO: enviar email al gerente general con la carta adjunta (nodemailer)
    return { enviado_a: 'gerente@empresa.cl', propiedad: instancia.admin_new_id };
  },

  async ALERTAS_PRE_REMATE() {
    // TODO: programar avisos 24 h, 1 h y 15 min antes de fecha_remate
    return { alertas: ['24h', '1h', '15min'] };
  },

  async RECALCULAR_PLAZOS() {
    // TODO: cuando existan plazos, recalcular vence_en de las tareas abiertas
    return { recalculado: true };
  },

  async CREAR_PROYECTO({ instancia }) {
    // TODO: crear el proyecto de la propiedad adjudicada en el sistema que corresponda
    return { proyecto: `PRY-${instancia.admin_new_id}` };
  }
};
