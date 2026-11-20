export interface SourceAgentUser {
  readonly adminNewUserId: number;
  readonly name: string | null;
  readonly rut: string | null;
  readonly email: string | null;
  readonly legacyPassword: string | null;
  readonly adminNewAreaId: number;
  readonly adminNewAreaName: string | null;
  readonly adminNewRegion: string | null;
}
