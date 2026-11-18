import { describe, expect, it } from 'vitest';
import { Interactions, type Attack, type AttackOutcome } from '../../../src/sim/core/interactions';
import { Journal } from '../../../src/sim/core/journal';

describe('interactions between beings of different systems', () => {
  it('the target owner applies the blow, then the attacker owner applies the outcome', () => {
    const journal = new Journal();
    const interactions = new Interactions(journal);
    const order: string[] = [];
    let health = 30;
    const view = { forEachNear: () => {}, forEachAlive: () => {}, hunting: () => false, x: () => 4, y: () => 5, alive: () => health > 0 };
    interactions.register('human', view, {
      sufferAttack: (_id: number, attack: Attack): AttackOutcome => {
        order.push('target');
        health -= attack.damage;
        return { killed: health <= 0, remains: 10, x: 4, y: 5, eventId: -1 };
      },
    });
    let ate = 0;
    interactions.register('animal', view, {
      attackDone: (_id, _attack, outcome) => {
        order.push('attacker');
        if (outcome.killed) ate = outcome.remains;
      },
    });
    const blow = { attacker: { kind: 'animal', id: 1 }, target: { kind: 'human', id: 0 }, damage: 20, attackerName: 'loup', tick: 0 } as const;
    expect(interactions.attack(blow).killed).toBe(false);
    expect(interactions.attack(blow).killed).toBe(true);
    expect(order).toEqual(['target', 'attacker', 'target', 'attacker']);
    expect(ate).toBe(10);
    expect(interactions.view('human')).toBe(view);
  });

  it('refuses an attack on a kind of being that cannot be attacked', () => {
    const interactions = new Interactions(new Journal());
    const blow = { attacker: { kind: 'animal', id: 1 }, target: { kind: 'human', id: 0 }, damage: 1, attackerName: 'loup', tick: 0 } as const;
    expect(() => interactions.attack(blow)).toThrow(/ne peuvent pas être attaqués/);
  });
});
