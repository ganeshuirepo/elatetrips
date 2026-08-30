/**
 * "Is this a real supply partner?" — asked by modules that must not depend on
 * the module that answers.
 *
 * Partner identity has exactly one owner (the M3 supplier directory). The rate
 * card and the console both need to check an id against it, and neither should
 * import it: the rate card would gain a dependency on supplier onboarding, and
 * the console on both. So the question lives here as a port, the container
 * adapts the directory onto it once, and every consumer asks the same question
 * of the same source.
 */
export interface IPartnerDirectory {
  /** True when this id names a real supply partner. */
  exists(partner_id: string): Promise<boolean>;
}

/**
 * A directory backed by a fixed set of ids — for tests, and for a host with no
 * supplier directory wired at all.
 */
export class StaticPartnerDirectory implements IPartnerDirectory {
  private readonly ids: ReadonlySet<string>;

  constructor(ids: Iterable<string> = []) {
    this.ids = new Set(ids);
  }

  async exists(partner_id: string): Promise<boolean> {
    return this.ids.has(partner_id);
  }
}
