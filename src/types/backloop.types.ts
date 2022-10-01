import type { Objectra } from "..";
import { ES3Primitives, ExtractArrayIndexes, ImplicitArray, UnindexableArray, IndexableObject } from "./util.types";

export namespace Backloop {
  export interface Endpoint<_ extends Objectra> {};

  export type Reference<T extends Objectra = Objectra> = (
    T['content'] extends ES3Primitives ?
      Endpoint<T> :
      T['content'] extends Array<infer U> | ReadonlyArray<any> ?
        U extends Objectra ?
          readonly Objectra<Reference<U>>[] :
          { [K in ExtractArrayIndexes<T['content']>]: Reference<T['content'][K]> } :
        { [K in keyof T['content']]: Reference<T['content'][K]> }
  );

  export type ReferenceResolve<T extends Reference & { [key: string | number]: any }> = (
		T extends Endpoint<infer U> ? 
			U extends Objectra ?
				U :
				T extends ImplicitArray<infer U2> ? // infer array type U2
					U2 extends Endpoint<infer U3> ? // infer endpoint saved type U3 (Objectra)
						{} extends T ? // Check if reference T is object 
							Objectra<
								{} extends T ?
									readonly U3[] :
									ObjectReferenceResolve<T> & UnindexableArray<ReferenceResolve<T[keyof T]>>
							> :
							ObjectReferenceResolve<T> :
					never :
				never :
			never
	);

  export type ObjectReferenceResolve<T extends Reference & {[key: string | number]: Reference}> = { [K in keyof T]: ReferenceResolve<T[K]>};
	// type b = Reference<Objectra<{ a: string, b: 'dsa' }>>;
	// type c = ReferenceResolve<b>;
	// type a = ObjectReferenceResolve<{ a: Objectra<string, number>, b: '' }>;

	export type ResolveRepresenter = <T extends Backloop.Reference>(representer: T) => Backloop.ReferenceResolve<T>;
	export type ReferenceDuplex<K, T> = readonly [Backloop.Reference<Objectra<K, T>>, ResolveRepresenter];

	// type a = Reference<Objectra<string>>
	// type r = ReferenceResolve<a>;
}

