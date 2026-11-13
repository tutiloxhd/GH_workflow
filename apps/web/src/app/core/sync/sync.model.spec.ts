import { formatDateTime } from '../time/santiago-time';
import { describeChange, isReviewable, type SourceChange } from './sync.model';

const baseChange: SourceChange = {
  id: 1,
  propertyId: 10,
  adminNewId: 13815,
  propertyTitle: 'Propiedad sintética',
  workflowId: 3,
  changeType: 'AUCTION_DATE_CHANGED',
  status: 'PENDING',
  previousValues: null,
  currentValues: null,
  errorMessage: null,
  detectedAt: '2026-11-13T15:00:00.000Z',
  processedAt: null,
};

describe('describeChange', () => {
  it('muestra el valor anterior y el nuevo de cada fecha en hora de Santiago', () => {
    const lines = describeChange({
      ...baseChange,
      previousValues: { auctionAt: '2026-12-07T13:30:00.000Z' },
      currentValues: { auctionAt: '2026-12-14T13:30:00.000Z' },
    });

    expect(lines).toEqual([
      `Remate: ${formatDateTime('2026-12-07T13:30:00.000Z')} → ${formatDateTime('2026-12-14T13:30:00.000Z')}`,
    ]);
  });

  it('resume los datos que cambiaron y marca los vacíos', () => {
    const lines = describeChange({
      ...baseChange,
      changeType: 'PROPERTY_DATA_CHANGED',
      previousValues: { commune: 'Ñuñoa', caseReference: null },
      currentValues: { commune: 'Providencia', caseReference: 'c-1-2026' },
    });

    expect(lines).toEqual(['Comuna: Ñuñoa → Providencia', 'Rol: — → c-1-2026']);
  });

  it('explica por qué una propiedad dejó de estar aceptada', () => {
    const noLongerAccepted = { ...baseChange, changeType: 'NO_LONGER_ACCEPTED' as const };

    expect(
      describeChange({ ...noLongerAccepted, currentValues: { existsInSource: false } }),
    ).toEqual(['La propiedad ya no existe en admin_new.']);
    expect(
      describeChange({
        ...noLongerAccepted,
        currentValues: { existsInSource: true, classificationId: 3 },
      }),
    ).toEqual(['Clasificación actual en admin_new: 3.']);
  });

  it('una propiedad aceptada sin workflow muestra el motivo', () => {
    expect(
      describeChange({
        ...baseChange,
        changeType: 'PROPERTY_ACCEPTED',
        status: 'IGNORED',
        errorMessage: 'El remate ya ocurrió; no se inicia el workflow',
      }),
    ).toEqual(['El remate ya ocurrió; no se inicia el workflow']);
  });
});

describe('isReviewable', () => {
  it('solo el aviso pendiente de propiedad no aceptada se revisa a mano', () => {
    expect(isReviewable({ ...baseChange, changeType: 'NO_LONGER_ACCEPTED' })).toBe(true);
    expect(
      isReviewable({ ...baseChange, changeType: 'NO_LONGER_ACCEPTED', status: 'PROCESSED' }),
    ).toBe(false);
    expect(isReviewable(baseChange)).toBe(false);
  });
});
