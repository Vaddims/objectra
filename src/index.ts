import { Backloop } from "./types/backloop.types";
import { Constructor, ES3Primitives, ExtractArrayIndexes, IndexableObject, UnindexableArray } from "./types/util.types";
import { Transformator } from "./transformator";
import { isPrimitive } from "./utils";
import './transformators';
import {
	InvalidPassthroughArgumentError, 
	InstantiationMethodDoesNotExistError,
	InvalidInstantiationArgumentQuantityError,
	TransformatorMatchNotFoundError,
	ForeignBackloopReferenceError, 
} from "./errors";

export class Objectra<ContentType extends Objectra.Content<any> = Objectra.Content<any>, InstanceType = any> {
	private readonly name?: string;
	private readonly type?: string;
	private readonly overload?: number;
	public readonly content: ContentType;

	private constructor(init: Objectra.Init<ContentType>) {
		const { identifier, content, overload } = init;
		
		this.overload = overload;
		this.content = content;

		if (typeof identifier === 'string') {
			this.name = identifier;
		} else if (typeof identifier === 'function') {
			this.type = identifier.name;
		}
	}

	public static from<T>(value: T): Objectra<Objectra.Content<T>, T> {
		const objectraValueSerialization: Objectra.ValueSerialization = <T>(instance: T) => {
			if (typeof instance === 'undefined') {
				return new Objectra<Objectra.Content<T>>({ content: undefined as Objectra.Content<any> });
			}

			if (instance === null) {
				return new Objectra<Objectra.Content<T>>({ content: null as Objectra.Content<any> });
			}

			const objectInstance = instance as Object;

			if (typeof objectInstance.constructor !== 'function') {
				throw new Error(`Can not objectrafy an object inherited value without a constructor`);
			}

			const superTransformators = Transformator.getSuperClassTransformators(objectInstance.constructor as Constructor);
			const transformators = [...superTransformators];
			
			const instanceTransformator = Transformator.get(objectInstance.constructor);
			if (instanceTransformator) {
				transformators.unshift(instanceTransformator);
			}

			for (const transfarmator of transformators) {
				if (transfarmator.serialize) {
					const objectraContent = transfarmator.serialize({
						instance: objectInstance,
						objectrafy: objectraValueSerialization,
					}) as Objectra.Content<T>;

					return new Objectra({ 
						identifier: objectInstance.constructor, 
						content: objectraContent, 
					});
				}
			}

			throw new TransformatorMatchNotFoundError(objectInstance.constructor);
		}

		return objectraValueSerialization(value);
	}

	public instantiate(): InstanceType {
		const objectraValueInstantiation: Objectra.ValueInstantiation = (objectra) => {
			if (objectra.name) {
				const transformator = Transformator.get(objectra.name);

				if (!transformator.instantiate) {
					throw new InstantiationMethodDoesNotExistError(objectra.name);
				}

				return transformator.instantiate({
					value: objectra,
					instantiate: objectraValueInstantiation,
				});
			}

			if (objectra.type) {
				const transformator = Transformator.getByConstructorName(objectra.type, objectra.overload);

				if (transformator) {
					if (transformator.instantiate) {
						return transformator.instantiate({
							value: objectra,
							instantiate: objectraValueInstantiation,
						});
					}

					const { content } = objectra;
					const useForceArgumentPassthrough = transformator.ignoreDefaultTypeBehaviour && transformator.argumentPassthrough;
					if (isPrimitive(content) && useForceArgumentPassthrough) {
						try {
							return new transformator.type(content);
						} catch (error) {
							if (error instanceof TypeError) {
								try {
									return (transformator.type as Function)(content);
								} catch {}
							}

							throw new InvalidPassthroughArgumentError(objectra.type, error);
						}
					}
				}
	
				const typeConstructorParams = transformator.type.length;
				if (!transformator.ignoreDefaultTypeBehaviour && !transformator.argumentPassthrough && typeConstructorParams) {
					throw new InstantiationMethodDoesNotExistError(objectra.type);
				}
	
				const superTransformators = Transformator.getSuperClassTransformators(transformator.type);
				for (const superTransfarmator of superTransformators) {
					if (superTransfarmator.instantiate) {
						const useForceArgumentPassthrough = transformator.ignoreDefaultTypeBehaviour && transformator.argumentPassthrough;
						if (useForceArgumentPassthrough) {
							const value = superTransfarmator.instantiate({
								value: objectra,
								instantiate: objectraValueInstantiation,
							});
							
							try {
								return new transformator.type(value);
							} catch (error) {
								if (error instanceof TypeError) {
									try {
										return (transformator.type as Function)(value);
									} catch {}
								}
	
								throw new InvalidPassthroughArgumentError(objectra.type, error);
							}
						}
	
						if (typeConstructorParams === 0) {
							const instance = new transformator.type();
							superTransfarmator.instantiate({
								value: objectra,
								instantiate: objectraValueInstantiation,
								instance,
							});

							return instance;
						}
					}
				}

				throw new InvalidInstantiationArgumentQuantityError(objectra.type!);
			}

			if (objectra.content === null) {
				return null;
			}

			return undefined;
		}

		return objectraValueInstantiation(this);
	}

	public static duplicate<T>(value: T) {
		return Objectra.from(value).instantiate();
	}

	public createBackloopReferenceDuplex(): Objectra.BackloopDuplex<ContentType> {
		type Representer = {} | [];
		const referenceMap = new Map<Representer, Objectra<any>>();

		type ObjectraPreload = Objectra<Objectra.Content<any>>;
		const createReference: Objectra.BackloopReferenceCreator = <T extends ObjectraPreload>(objectra: T) => {
			if (typeof objectra.content !== 'object' || objectra.content === null) {
				const representer = {};
				referenceMap.set(representer, objectra);
				return representer as Backloop.Reference<T>;
			}

			if (Array.isArray(objectra.content)) {
				const representer = objectra.content.map(createReference);
				referenceMap.set(representer, objectra);
				return representer as any as Backloop.Reference<T>;
			}

			const representer = {} as { [K: string]: Backloop.Reference };
			for (const key in objectra.content) {
				representer[key] = createReference(objectra.content[key]);
			}

			referenceMap.set(representer, objectra);
			return representer as Backloop.Reference<T>;
		}

		const resolveReference: Objectra.BackloopReferenceResolver = <T extends Backloop.Reference>(representer: T) => {
			const objectra = referenceMap.get(representer);
			if (!objectra) {
				throw new ForeignBackloopReferenceError();
			}

			return objectra as Backloop.ReferenceResolve<T>;
		}

		const representer: Backloop.Reference<typeof this> = createReference(this); // TS requires explicit type
		return [representer, resolveReference];
	}
}

export namespace Objectra {
	export type ContentStructure<T> = ES3Primitives | IndexableObject<T> | T[];
	export type Content<T = ContentStructure<Objectra>> = (
		T extends ES3Primitives ?
			T :
			T extends Array<infer U> | ReadonlyArray<any> ?
				U extends undefined | null | Object ?
					readonly Objectra<Content<U>>[] :
					{ [K in ExtractArrayIndexes<T>]: Objectra<Content<T[K]>> } & 
					UnindexableArray<Objectra<Content<T[ExtractArrayIndexes<T>]>>> :
				{ [K in keyof T]: Objectra<Content<T[K]>> }
	);

	export interface Init<ContentType extends Objectra.Content<any>> {
		readonly identifier?: Constructor | Function | string;
		readonly id?: string;
		readonly overload?: number;
		readonly content: ContentType;
	}

	export type ValueSerialization = <T>(instance: T) => Objectra<Objectra.Content<T>, T>;
	export type ValueInstantiation = <K, T>(instance: Objectra<K, T>) => T;

	export type BackloopReferenceCreator = <T extends Objectra<Objectra.Content<any>>>(objectra: T) => Backloop.Reference<T>;
	export type BackloopReferenceResolver = <T extends Backloop.Reference>(representer: T) => Backloop.ReferenceResolve<T>;
	export type BackloopDuplex<T> = readonly [Backloop.Reference<Objectra<T>>, BackloopReferenceResolver];
}