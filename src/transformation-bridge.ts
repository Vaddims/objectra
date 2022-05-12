import type { Objectra } from ".";

export class TransformationBridge<T> {
  public readonly value: T;
  public readonly objectrafy: (value: unknown) => Objectra;

  constructor(value: T, objectrafy: (value: unknown) => Objectra) {
    this.value = value;
    this.objectrafy = objectrafy;
  }
}