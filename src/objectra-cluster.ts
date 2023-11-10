import type { Objectra } from ".";
import { Constructor } from "./types/util.types";

export class ObjectraCluster {
  private readonly objectraDescriptorMap: Map<Objectra, ObjectraCluster.Entry.Descriptor>;

  constructor(iterable?: Iterable<ObjectraCluster.Entry>) {
    if (!iterable) {
      this.objectraDescriptorMap = new Map();
      return;
    }

    this.objectraDescriptorMap = new Map(iterable);
  }

  public get size() {
    return this.objectraDescriptorMap.size;
  }

  public add(objectra: Objectra, descriptor: ObjectraCluster.Entry.Descriptor) {
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

  public referenceDeclarations() {
    return this.filter(objectra => objectra.isReferenceDeclaration);
  }

  public referenceConsumers() {
    return this.filter(objectra => objectra.isReferenceConsumer);
  }

  public instancesOf(constructor: Constructor) {
    return this.filter(objectra => objectra.contentIsInstanceOf(constructor));
  }

  public classDeclarations() {
    return this.filter(objectra => objectra.isClassDeclaration);
  }

  public primitiveValue(primitive: string | number | boolean) {
    return this.filter(objectra => objectra['content'] === primitive);
  }

  private filter(filter: (objectra: Objectra, descriptor: ObjectraCluster.Entry.Descriptor) => boolean) {
    for (const [ objectra, descriptor ] of this.objectraDescriptorMap) {
      if (!filter(objectra, descriptor)) {
        this.objectraDescriptorMap.delete(objectra);
      }
    }

    return this;
  }
}

export namespace ObjectraCluster {
  export type Entry = readonly [Objectra, Entry.Descriptor];
  export namespace Entry {
    export interface Descriptor {
      readonly path: string[];
    }
  }
}