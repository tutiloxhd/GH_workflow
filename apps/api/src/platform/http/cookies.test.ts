import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies.js';

describe('readCookie', () => {
  it('devuelve el valor de la cookie pedida entre varias', () => {
    expect(readCookie('theme=dark; gh_session=abc%2D123; other=1', 'gh_session')).toBe('abc-123');
  });

  it('no confunde cookies cuyo nombre contiene al buscado', () => {
    expect(readCookie('old_gh_session=x', 'gh_session')).toBeUndefined();
  });

  it('devuelve undefined sin encabezado o con codificación inválida', () => {
    expect(readCookie(undefined, 'gh_session')).toBeUndefined();
    expect(readCookie('gh_session=%E0%A4%A', 'gh_session')).toBeUndefined();
  });
});
