import { Objectra } from "../src";
import { Transformator } from "../src/transformator";

@Transformator.Register<InclusionEntity>()
class InclusionEntity {
  @Transformator.Exclude()
  readonly seed: number;

  @Transformator.InvertFromMapping() // Property is excluded
  readonly internalId: number;

  @Transformator.ConstructorArgument(0) // Property is excluded by default
  readonly name: string;

  public location?: string;
  public age?: number;
  
  constructor(name: string) {
    this.seed = Math.random();
    this.internalId = Math.random();
    this.name = name;
  }
}

@Transformator.Register<InclusionEntityChild>()
class InclusionEntityChild extends InclusionEntity {
  @Transformator.Include()
  readonly seed!: number;
}

describe(`test class decorators`, () => {
  test('With property inclusion mapping', () => {
    const entity = new InclusionEntity('Lerto');
    entity.location = 'Mars';
    entity.age = 241;
    
    const entityDuplicate = Objectra.duplicate(entity);

    expect(entityDuplicate).not.toBe(entity);

    expect(entityDuplicate.name).toBe(entity.name);
    expect(entityDuplicate.age).toBe(entity.age);
    expect(entityDuplicate.location).toBe(entity.location);

    expect(entityDuplicate.seed).not.toBe(entity.seed);
    expect(entityDuplicate.internalId).not.toBe(entity.internalId);
  });

  // test('With inherited object inclusion mapping', () => {
  //   const entity = new InclusionEntityChild('C5P');
  //   entity.location = 'Pluto';
  //   entity.age = 142;
    
  //   const entityDuplicate = Objectra.duplicate(entity);

  //   expect(entityDuplicate).not.toBe(entity);

  //   expect(entityDuplicate.name).toBe(entity.name);
  //   expect(entityDuplicate.age).toBe(entity.age);
  //   expect(entityDuplicate.location).toBe(entity.location);

  //   expect(entityDuplicate.seed).toBe(entity.seed);
  //   expect(entityDuplicate.internalId).not.toBe(entity.internalId);
  // });
});
