import { Objectra, Transformator } from "../src";

@Transformator.Register()
class ListedParent {
  isParent = true;

  @Transformator.Exclude()
  readonly seed = Math.random();
}

class UnlistedChild extends ListedParent {
  isChild = true;
}

describe('test transformator dynamic setup', () => {
  test('test unlisted class', () => {
    const unlistedChildInstance = new UnlistedChild();
    unlistedChildInstance.isParent = false;

    const unlistedChildDuplicate = Objectra.duplicate(unlistedChildInstance);

    expect(unlistedChildDuplicate).not.toBe(unlistedChildInstance);
    expect(unlistedChildInstance.isChild).toBe(unlistedChildDuplicate.isChild);
    expect(unlistedChildInstance.isParent).toBe(unlistedChildDuplicate.isParent);
    expect(unlistedChildInstance.seed).not.toBe(unlistedChildDuplicate.seed);
  });
});