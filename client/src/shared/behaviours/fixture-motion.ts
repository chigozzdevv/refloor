export class FixtureReservations {
  private entries = new Map<symbol, { buildingId: string; objectId: string }>();
  reserve(owner: symbol, buildingId: string, objectId: string) {
    this.entries.set(owner, { buildingId, objectId });
  }
  release(owner: symbol) {
    this.entries.delete(owner);
  }
  forBuilding(buildingId: string) {
    return new Set(
      [...this.entries.values()]
        .filter((value) => value.buildingId === buildingId)
        .map((value) => value.objectId),
    );
  }
}

export const fixtureReservations = new FixtureReservations();
