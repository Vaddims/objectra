import type { Objectra } from "..";
import type { ES3Primitives, ExtractArrayIndexes, ImplicitArray, UnindexableArray } from "./util.types";

export namespace Backloop {
  export interface Endpoint<_ extends Objectra> {};

  export type Reference<T extends Objectra = Objectra> = (
    Objectra.GetContentType<T> extends ES3Primitives ?
      Endpoint<T> :
      Objectra.GetContentType<T> extends Array<infer U> | ReadonlyArray<any> ?
        U extends Objectra ?
          readonly Objectra<Reference<U>>[] :
          { [K in ExtractArrayIndexes<Objectra.GetContentType<T>>]: Reference<Objectra.GetContentType<T>[K]> } :
        { [K in keyof Objectra.GetContentType<T>]: Reference<Objectra.GetContentType<T>[K]> }
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
	export type ResolveRepresenter = <T extends Backloop.Reference>(representer: T) => Backloop.ReferenceResolve<T>;
	export type ReferenceDuplex<K, T> = readonly [Backloop.Reference<Objectra<K, T>>, ResolveRepresenter];
}

