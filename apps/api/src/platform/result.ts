// Resultado tipado para fallos esperados de negocio; las excepciones quedan para lo inesperado.
export type Result<Value, Failure> =
  | { readonly isSuccess: true; readonly value: Value }
  | { readonly isSuccess: false; readonly failure: Failure };

export const succeed = <Value>(value: Value): Result<Value, never> => ({ isSuccess: true, value });

export const fail = <Failure>(failure: Failure): Result<never, Failure> => ({
  isSuccess: false,
  failure,
});
