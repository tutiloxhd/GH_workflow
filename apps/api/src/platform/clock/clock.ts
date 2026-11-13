// Único punto de acceso a la hora actual: las pruebas lo reemplazan por un reloj fijo.
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
