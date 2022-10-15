import { Backloop } from "./types/backloop.types";
import { Constructor, ES3Primitives, ExtractArrayIndexes, IndexableObject, UnindexableArray } from "./types/util.types";
import { Transformator } from "./transformator";
import { isClass, isPrimitive } from "./utils";
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
	private readonly content: ContentType;

	private constructor(init: Objectra.Init<ContentType>) {
		const { identifier, content, overload } = init;
		
		if (overload || overload === 0) {
			this.overload = overload;
		}

		this.content = content;

		if (typeof identifier === 'string') {
			this.name = identifier;
		} else if (typeof identifier === 'function') {
			this.type = identifier.name;
		}
	}

	public static from<T>(value: T): Objectra<Objectra.Content<T>, T> {
		// TODO Add reference serialization
		
		const objectraValueSerialization: Objectra.ValueSerialization = <T>(instance: T) => {
			// TODO Make function serialization
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

			const superTransformators = Transformator.getSuperTransformators(objectInstance.constructor as Constructor);
			const transformators = [...superTransformators];
			
			const instanceTransformator = Transformator.get(objectInstance.constructor);
			if (instanceTransformator) {
				transformators.unshift(instanceTransformator);
			}

			for (const transformator of transformators) {
				if (transformator.serialize) {
					const objectraContent = transformator.serialize({
						instance: objectInstance,
						objectrafy: objectraValueSerialization,
						instanceTransformator,
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
		// TODO Add reference instantiation

		const objectraValueInstantiation: Objectra.ValueInstantiation = (objectra) => {
			// TODO Make function instantiation

			const { name, type, overload, content } = objectra;

			const createInstantiationBridge = (transformator: Transformator): Transformator.InstantiationBridge<any, any> => ({
				value: objectra,
				instantiate: objectraValueInstantiation,
				initialTransformator: transformator,
			});

			if (name) {
				const transformator = Transformator.get(name);
				if (!transformator.instantiate) {
					throw new InstantiationMethodDoesNotExistError(name);
				}

				return transformator.instantiate(createInstantiationBridge(transformator));
			}

			if (type) {
				const transformator = Transformator.getByType(type, overload);

				const constructType = (...typeArguments: unknown[]) => {
					try {
						if (isClass(transformator.type)) {
							return new transformator.type(...typeArguments);
						}

						return transformator.type(...typeArguments);							
					} catch (error) {
						throw new InvalidPassthroughArgumentError(type, error);
					}
				}

				if (transformator) {
					if (transformator.instantiate) {
						return transformator.instantiate(createInstantiationBridge(transformator));
					}

					const typeConstructorParams = transformator.type.length;
					const useForceArgumentPassthrough = transformator.ignoreDefaultArgumentBehaviour && transformator.argumentPassthrough;
					if (isPrimitive(content) && (typeConstructorParams === 1 || useForceArgumentPassthrough)) {
						return constructType(content);
					}
				}

				// TODO Overhaul
				if (!isClass(transformator.type)) {
					throw new Error(`Can not get superclasses of function`);
				}
	
				const typeConstructorParams = transformator.type.length;
				// TODO Add check for transformator instantiation method
	
				const superTransformators = Transformator.getSuperTransformators(transformator.type);
				for (const superTransfarmator of superTransformators) {
					if (!superTransfarmator.instantiate) {
						continue;
					}

					if (transformator['argumentPassthroughPropertyKeys'].length > 0) {
						const instantiationOptions = createInstantiationBridge(transformator);
						const value = superTransfarmator.instantiate(instantiationOptions);

						const propKeys = transformator['argumentPassthroughPropertyKeys'];
						const args = propKeys.map(key => value[key]);
						
						const instance = constructType(...args);

						// TODO Use transformator whitelist
						const unusedKeys = Object.keys(value).filter(key => 
							!transformator['argumentPassthroughPropertyKeys'].includes(key)
						);

						for (const key of unusedKeys) {
							instance[key] = value[key];
						}

						return instance;
					}

					if (transformator.argumentPassthrough && (transformator.ignoreDefaultArgumentBehaviour || typeConstructorParams === 1)) {
						const value = superTransfarmator.instantiate(createInstantiationBridge(transformator));
						return constructType(value);
					}

					if (typeConstructorParams === 0) {
						const instance = new transformator.type();
						superTransfarmator.instantiate({
							...createInstantiationBridge(transformator),
							instance,
						});

						return instance;
					}
				}

				throw new InvalidInstantiationArgumentQuantityError(type);
			}

			if (content === null) {
				return null;
			}

			return undefined;
		}

		return objectraValueInstantiation(this);
	}

	public static duplicate<T>(value: T) {
		// TODO Overhaul and don't require function transformators
		return Objectra.from(value).instantiate();
	}

	protected createBackloopReferenceDuplex(): Objectra.BackloopDuplex<ContentType> {
		type Representer = {} | [];
		const referenceMap = new Map<Representer, Objectra<any>>();

		type CommonObjectra = Objectra<Objectra.Content<any>>;
		const createReference: Objectra.BackloopReferenceCreator = <T extends CommonObjectra>(objectra: T) => {
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
	export type Identifier = Constructor | Function | string;

	export type GetContentType<T extends Objectra> = T extends Objectra<infer U> ? U : never;
	export type GetInstanceType<T extends Objectra> = T extends Objectra<any, infer U> ? U : never;

	export type ContentStructure<T> = ES3Primitives | IndexableObject<T> | T[];

	// TODO Prevent object methods from type mapping
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
		readonly identifier?: Identifier;
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
