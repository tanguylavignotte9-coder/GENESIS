/**
 * What the individuals read of the groups system (step 9): the duties their leaders handed out, the
 * inheritance rule of their tribe, and whether a political ambition still holds. The groups system
 * implements it and attaches itself to the individuals system.
 */
export interface GroupView {
  /**
   * Factor on the urge to answer one of the camp's needs (0 food, 1 wood, 2 building, 3 crafting):
   * above 1 for the duty one was given, below for the others, 1 for who does not obey.
   */
  dutyFactor(person: number, duty: number): number;
  /** Inheritance rule of the person's tribe: "spouseChildren", "childrenEqual", "eldestChild" or "group". */
  inheritanceRule(person: number): string;
  stillWants(person: number, ambition: string): boolean;
}
