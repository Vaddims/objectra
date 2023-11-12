export type ES3Primitives = number | string | boolean | null | undefined;
export type ES6Primitives = ES3Primitives | Symbol | BigInt;

export type IterableEntity = unknown[] | IndexableObject;
export type IndexableObject<T = unknown> = { [key: string | symbol]: T } & Object;
export interface Constructor<T = any> {
  new (...args: any[]): T;
}

export type UnindexableArray<T> = Omit<readonly T[], number>;
export interface ImplicitArray<T = any> { [key: number]: T };
export type ExtractArrayIndexes<T extends ImplicitArray> = Extract<keyof T, `${number}`>;

export type Writeable<T> = { -readonly [P in keyof T]: T[P] };
export type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };


export namespace ClassDecorator {
  export type Accessor<T, V> = <TT = T, VV = V>(target: ClassAccessorDecoratorTarget<TT, VV>, context: ClassAccessorDecoratorContext<TT, VV>) => ClassAccessorDecoratorResult<TT, VV>;
}
