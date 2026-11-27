export const MAX_EVIDENCE_PHOTOS = 5;
export const MAX_EVIDENCE_PHOTO_BYTES = 5 * 1024 * 1024;

const signatures: Readonly<Record<string, (bytes: Buffer) => boolean>> = {
  'image/jpeg': (bytes) => bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9,
  'image/png': (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (bytes) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
};

export function isValidEvidencePhoto(bytes: Buffer, mimeType: string): boolean {
  return bytes.length > 0 && bytes.length <= MAX_EVIDENCE_PHOTO_BYTES &&
    (signatures[mimeType]?.(bytes) ?? false);
}
