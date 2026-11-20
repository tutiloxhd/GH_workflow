import { describe, expect, it } from 'vitest';
import { isParticipantRegionEligible } from './participant-eligibility.js';

describe('elegibilidad regional de participantes', () => {
  it('exige que el gestor pertenezca a la región de la propiedad', () => {
    expect(isParticipantRegionEligible('MANAGER', 'Valparaíso', 'Valparaiso', 'Presencial')).toBe(
      true,
    );
    expect(isParticipantRegionEligible('MANAGER', 'Coquimbo', 'Valparaíso', 'Videollamada')).toBe(
      false,
    );
  });

  it('limita al postor a la región salvo en modalidad videollamada', () => {
    expect(isParticipantRegionEligible('BIDDER', 'Coquimbo', 'Valparaíso', 'Presencial')).toBe(
      false,
    );
    expect(isParticipantRegionEligible('BIDDER', 'Coquimbo', 'Valparaíso', 'Videollamada')).toBe(
      true,
    );
  });

  it('no permite asignación regional cuando falta una región', () => {
    expect(isParticipantRegionEligible('MANAGER', null, 'Valparaíso', 'Presencial')).toBe(false);
    expect(isParticipantRegionEligible('BIDDER', 'Valparaíso', null, 'Presencial')).toBe(false);
  });

  it('no aplica la restricción regional a revisión legal', () => {
    expect(isParticipantRegionEligible('LEGAL_REVIEWER', null, null, 'Presencial')).toBe(true);
  });
});
