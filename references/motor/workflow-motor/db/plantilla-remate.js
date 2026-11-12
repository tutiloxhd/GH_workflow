// Definición del flujo de remate (la "plantilla").
// Es lo ÚNICO que hay que tocar para cambiar pasos, responsables u orden: el motor no conoce los pasos.
//
// tipo:    'manual' (la hace una persona) | 'automatica' (la ejecuta el worker con `accion`)
// rol:     quién la hace. 'sistema' = nadie (automática)
// depende: códigos que deben estar COMPLETADOS antes de que esta se active
// rama:    solo para las tareas que se abren según el resultado del remate
//
// El paso 1 de la maqueta ("Crear workflow") no es una tarea: es motor.iniciar().

module.exports = {
  nombre: 'Remate judicial',
  version: 1,
  tareas: [
    { codigo: 's2',  nombre: 'Asignar gestor y postor',           tipo: 'manual',     rol: 'admin',   depende: [] },
    { codigo: 's3',  nombre: 'Generar carta Vale Vista',          tipo: 'automatica', rol: 'sistema', depende: ['s2'], accion: 'GENERAR_CARTA_VV' },
    { codigo: 's4',  nombre: 'Enviar carta al GG',                tipo: 'automatica', rol: 'sistema', depende: ['s3'], accion: 'ENVIAR_CARTA_GG' },
    { codigo: 's5',  nombre: 'GG envía carta al banco',           tipo: 'manual',     rol: 'admin',   depende: ['s4'] },
    { codigo: 's6',  nombre: 'Generar formulario',                tipo: 'manual',     rol: 'gestor',  depende: ['s2'] },
    { codigo: 's7',  nombre: 'Revisión legal pre-entrega',        tipo: 'manual',     rol: 'legal',   depende: ['s2'] },  // paralela: nadie depende de ella
    { codigo: 's8',  nombre: 'Retirar Vale Vista',                tipo: 'manual',     rol: 'gestor',  depende: ['s5'] },
    { codigo: 's9',  nombre: 'Entregar Vale Vista + formulario',  tipo: 'manual',     rol: 'gestor',  depende: ['s6', 's8'] },
    { codigo: 's10', nombre: 'Registrar evidencia',               tipo: 'manual',     rol: 'gestor',  depende: ['s9'] },
    { codigo: 's11', nombre: 'Revisión legal final',              tipo: 'manual',     rol: 'legal',   depende: ['s10'] }, // paralela
    { codigo: 's12', nombre: 'Preparar participación',            tipo: 'manual',     rol: 'postor',  depende: ['s10'] },
    { codigo: 's13', nombre: 'Alertas pre-remate',                tipo: 'automatica', rol: 'sistema', depende: ['s12'], accion: 'ALERTAS_PRE_REMATE' },
    { codigo: 's14', nombre: 'Ingresar a sala virtual',           tipo: 'manual',     rol: 'postor',  depende: ['s12'] },
    { codigo: 's15', nombre: 'Participar en remate',              tipo: 'manual',     rol: 'postor',  depende: ['s14'] },
    { codigo: 's16', nombre: 'Registrar resultado',               tipo: 'manual',     rol: 'postor',  depende: ['s15'] },

    // Rama ADJUDICADO
    { codigo: '17A', nombre: 'Gestionar pago',        tipo: 'manual',     rol: 'gestor',  depende: ['s16'], rama: 'ADJUDICADO' },
    { codigo: '18A', nombre: 'Marcar adjudicada',     tipo: 'manual',     rol: 'admin',   depende: ['17A'], rama: 'ADJUDICADO' },
    { codigo: '19A', nombre: 'Crear proyecto',        tipo: 'automatica', rol: 'sistema', depende: ['18A'], rama: 'ADJUDICADO', accion: 'CREAR_PROYECTO' },
    // Rama NO ADJUDICADO
    { codigo: '17B', nombre: 'Recuperar garantía',    tipo: 'manual',     rol: 'gestor',  depende: ['s16'], rama: 'NO_ADJUDICADO' },
    { codigo: '18B', nombre: 'Registrar garantía',    tipo: 'manual',     rol: 'gestor',  depende: ['17B'], rama: 'NO_ADJUDICADO' },
    // Rama REPROGRAMADO
    { codigo: '17C', nombre: 'Actualizar fecha',      tipo: 'manual',     rol: 'admin',   depende: ['s16'], rama: 'REPROGRAMADO' },
    { codigo: '17D', nombre: 'Recalcular plazos',     tipo: 'automatica', rol: 'sistema', depende: ['17C'], rama: 'REPROGRAMADO', accion: 'RECALCULAR_PLAZOS' },
    { codigo: '17E', nombre: 'Continuar workflow',    tipo: 'manual',     rol: 'admin',   depende: ['17D'], rama: 'REPROGRAMADO' }
  ]
};
