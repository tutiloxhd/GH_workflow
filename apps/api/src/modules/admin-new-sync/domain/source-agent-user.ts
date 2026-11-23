export interface SourceAgentUser {
  readonly adminNewUserId: number;
  readonly name: string | null;
  readonly rut: string | null;
  readonly email: string | null;
  readonly legacyPassword: string | null;
  readonly areaId: number | null;
  readonly regionName: string | null;
}
