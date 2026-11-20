import type { ParticipantType } from './participants.js';

const VIDEO_CALL_MODE = 'videollamada';

function normalizedLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-CL');
}

export function isVideoCallAuction(mode: string | null): boolean {
  return mode !== null && normalizedLabel(mode) === VIDEO_CALL_MODE;
}

export function isParticipantRegionEligible(
  participantType: ParticipantType,
  userRegion: string | null,
  propertyRegion: string | null,
  auctionMode: string | null,
): boolean {
  if (participantType === 'LEGAL_REVIEWER') return true;
  if (participantType === 'BIDDER' && isVideoCallAuction(auctionMode)) return true;
  if (!userRegion || !propertyRegion) return false;
  return normalizedLabel(userRegion) === normalizedLabel(propertyRegion);
}
