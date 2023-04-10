import type { Objectra } from ".";
import { Constructor } from "./types/util.types";

export interface ObjectraDescriptor {
  readonly path: string[];
}

export type ObjectraDescriptorTuple = readonly [Objectra, ObjectraDescriptor]

export class ObjectraCluster {
  private readonly objectraDescriptorMap: Map<Objectra, ObjectraDescriptor>;

  constructor(iterable?: Iterable<ObjectraDescriptorTuple>) {
    if (!iterable) {
      this.objectraDescriptorMap = new Map();
      return;
    }

    this.objectraDescriptorMap = new Map(iterable);
  }

  public get size() {
    return this.objectraDescriptorMap.size;
  }

  public add(objectra: Objectra, descriptor: ObjectraDescriptor) {
    return this.objectraDescriptorMap.set(objectra, descriptor);
  }

  public has(objectra: Objectra) {
    return this.objectraDescriptorMap.has(objectra);
  }

  public remove(objectra: Objectra) {
    return this.objectraDescriptorMap.delete(objectra);
  }

  public clear() {
    this.objectraDescriptorMap.clear();
  }

  public [Symbol.iterator]() {
    return this.objectraDescriptorMap.keys();
  }

  public endpoints() {
    return this.filter(objectra => objectra.isStructureEndpoint);
  }

  public referenceHoists() {
    return this.filter(objectra => objectra.isReferenceHoist);
  }

  public declarations() {
    return this.filter(objectra => objectra.isDeclaration);
  }

  public referenceConsumers() {
    return this.filter(objectra => objectra.isConsumer)
  }

  public instancesOf(constructor: Constructor) {
    return this.filter(objectra => objectra.contentIsInstanceOf(constructor))
  }

  public constructorTyped() {
    return this.filter(objectra => objectra.identifierIsConstructor)
  }

  public primitiveValue(primitive: string | number | boolean) {
    return this.filter(objectra => objectra['content'] === primitive);
  }

  private filter(filter: (objectra: Objectra, descriptor: ObjectraDescriptor) => boolean) {
    for (const [ objectra, descriptor ] of this.objectraDescriptorMap) {
      if (!filter(objectra, descriptor)) {
        this.objectraDescriptorMap.delete(objectra);
      }
    }

    return this;
  }
}