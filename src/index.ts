import { everyArrayElementIsEqual, isClass, isPrimitive } from "./utils";
import { Backloop } from "./types/backloop.types";
import { Transformator } from "./transformator";
import './transformators';

import {
	InvalidPassthroughArgumentError, 
	InstantiationMethodDoesNotExistError,
	InvalidInstantiationArgumentQuantityError,
	TransformatorMatchNotFoundError,
	ForeignBackloopReferenceError, 
} from "./errors";

import type { 
	Constructor, 
	ES3Primitives, 
	ExtractArrayIndexes, 
	IndexableObject, 
	UnindexableArray,
	IterableEntity,
} from "./types/util.types";

export class Objectra<ContentType extends Objectra.Content<any> = Objectra.Content<any>, InstanceType = any> {
	private readonly id?: number;
	private readonly name?: string;
	private readonly type?: Objectra.Identifier;
	private readonly overload?: number;
	private readonly content?: ContentType;
	private readonly hoistingReferences: Objectra[] = [];

	private constructor(init: Objectra.Init<ContentType>) {
		const { identifier, overload } = init;
		
		if (identifier) {
			this.type = identifier;
		}

		if (overload || overload === 0) {
			this.overload = overload;
		}

		if ('content' in init) {
			this.content = init.content;
		}

		if ('hoistingReferences' in init && init.hoistingReferences) {
			this.hoistingReferences = [...init.hoistingReferences];
		}

		if ('id' in init && typeof init.id !== 'undefined') {
			this.id = init.id;
		}
	}

	private get isReferenceDependence() {
		return typeof this.id !== 'undefined' && typeof this.content === 'undefined';
	}

	private get isReferenceSource() {
		return typeof this.id !== 'undefined' && typeof this.content !== 'undefined';
	}

	private static isIterableEntity(target: unknown): target is IterableEntity {
		return typeof target === 'object' && target !== null;
	}

	private static isValueReference(target: unknown): target is Objectra.Reference {
		return Objectra.isIterableEntity(target) || typeof target === 'symbol';
	}

	public static getObjectReferenceData(value: unknown): Objectra.ObjectReferenceData {
		const referenceAppearancePathMap: Objectra.ReferenceAppearancePathMap = new Map();
		const repeatingReferences: Objectra.Reference[] = [];

		const analyzeValue = (target: unknown, pathStack: IterableEntity[] = []) => {
			if (!Objectra.isValueReference(target)) {
				return;
			}

			const referenceApearancePaths = referenceAppearancePathMap.get(target);
			if (referenceApearancePaths) {
				if (!repeatingReferences.includes(target)) {
					repeatingReferences.push(target);
				}

				if (Objectra.isIterableEntity(target) && pathStack.includes(target)) {
					return; // The object has circular reference to itself
				}

				referenceApearancePaths.push([...pathStack]);
			} else {
				referenceAppearancePathMap.set(target, [[...pathStack]]);
			}

			if (typeof target === 'symbol') {
				return;
			}

			if (repeatingReferences.includes(target)) {
				return;
			}

			if (Array.isArray(target)) {
				target.forEach(element => analyzeValue(element, [...pathStack, target]));
				return;
			}

			const indexableObjectKeys = Object.getOwnPropertyNames(target);
			for (const key of indexableObjectKeys) {
				analyzeValue(target[key], [...pathStack, target]);
			}
			return;
		}

		analyzeValue(value);

		return {
			referenceAppearancePathMap,
			repeatingReferences,
		}
	}

	public static *multidimensionalIndexEnumeration(maxIndexes: number[]): IterableIterator<number[]> {
		const indexes = new Array<number>(maxIndexes.length).fill(0);
		const lastStackIndex = maxIndexes.length - 1;

		let indexOverflow = false;
		while (!indexOverflow) {
			yield indexes;

			let targetStack = 0;
			let shift = false; 
			
			do {
				shift = false;
				
				const index = indexes[targetStack];
				const maxIndex = maxIndexes[targetStack];
				if (index < maxIndex) {
					indexes[targetStack]++;
				} else if (targetStack === lastStackIndex && index === maxIndex) {
					indexOverflow = true;
				} else {
					indexes[targetStack] = 0;
					targetStack++;
					shift = true;
				}
			} while (shift);
		}
	}

	private static getReferenceCommonParent(originalReferenceAppearancePaths: IterableEntity[][]) {
		const referenceAppearancePaths = originalReferenceAppearancePaths.map(stack => [...stack].reverse());
		const referenceAppearancePathMaxIndexes = referenceAppearancePaths.map((paths) => paths.length - 1);
		const multidimensionalIndexIterator = Objectra.multidimensionalIndexEnumeration(referenceAppearancePathMaxIndexes);

		for (const indexes of multidimensionalIndexIterator) {
			const indexedReferenceAppearancePaths = indexes.map((index, stack) => referenceAppearancePaths[stack][index]);
			if (everyArrayElementIsEqual(indexedReferenceAppearancePaths)) {
				return referenceAppearancePaths[0]?.[indexes[0]];
			}
		}
	} 

	private static getReferenceHoistingParents(objectReferenceData: Objectra.ObjectReferenceData) {
		const { repeatingReferences, referenceAppearancePathMap } = objectReferenceData;
		const referenceHoistingParents = new Map<Objectra.Reference, Objectra.Reference>();

		for (const repeatingReference of repeatingReferences) {
			const referenceAppearancePaths = referenceAppearancePathMap.get(repeatingReference)!;
			const referenceParent = Objectra.getReferenceCommonParent(referenceAppearancePaths);
			if (referenceParent) {
				referenceHoistingParents.set(repeatingReference, referenceParent);
			}
		}

		return referenceHoistingParents;
	}

	public static from<T>(value: T): Objectra<Objectra.Content<T>, T> {
		const objectReferenceData = Objectra.getObjectReferenceData(value);
		const referenceHoistingParentMap = Objectra.getReferenceHoistingParents(objectReferenceData);
		const referenceHoistingParentArray = Array.from(referenceHoistingParentMap);

		const referableReferences: Objectra.Reference[] = [];
		const { repeatingReferences } = objectReferenceData;

		const coldSerializationPermission = new Set<Objectra.Reference>();

		const objectraValueSerialization: Objectra.ValueSerialization = <T>(instance: T) => {
			// TODO Make function serialization
			if (typeof instance === 'function') {
				return new Objectra<Objectra.Content<T>>({ content: undefined });
			}

			if (typeof instance === 'undefined') {
				return new Objectra<Objectra.Content<T>>({ content: undefined });
			}

			if (instance === null) {
				return new Objectra<Objectra.Content<T>>({ content: null as Objectra.Content<any> });
			}

			const objectInstance = instance as T & Objectra.Reference; // TODO Check for primitives

			if (typeof objectInstance.constructor !== 'function') {
				throw new Error(`Can not objectrafy an object inherited value without a constructor`);
			}

			const instanceIsReference = Objectra.isValueReference(objectInstance);
			const isReferenceSource = instanceIsReference && repeatingReferences.includes(objectInstance);

			if (instanceIsReference && referableReferences.includes(objectInstance) && !coldSerializationPermission.has(objectInstance)) {
				return new Objectra({ id: referableReferences.indexOf(objectInstance) });
			}
			
			const instanceTransformator = Transformator.get(objectInstance.constructor as Constructor);
			const superTransformators = Transformator.getSuperTransformators(objectInstance.constructor as Constructor);

			const transformators: Transformator[] = [];
			if (instanceTransformator) {
				transformators.push(instanceTransformator);
			}
			transformators.push(...superTransformators);

			for (const transformator of transformators) {
				if (!transformator.serialize) {
					continue;
				}

				coldSerializationPermission.delete(objectInstance);

				const instanceReferenceHoistings = (
					referenceHoistingParentArray
						.filter(([, parent]) => parent === objectInstance)
						.map(([reference]) => reference)
				);

				instanceReferenceHoistings.forEach((reference) => {
					referableReferences.push(reference);
				})

				const instanceObjectraHoistings = instanceReferenceHoistings.map((reference) => {
					coldSerializationPermission.add(reference);
					const objectra = objectraValueSerialization(reference);
					coldSerializationPermission.delete(reference);
					return objectra;
				});

				if (instanceIsReference && !referableReferences.includes(objectInstance)) {
					referableReferences.push(objectInstance)
				}

				const objectraContent = transformator.serialize({
					instance: objectInstance,
					objectrafy: objectraValueSerialization,
					instanceTransformator,
				}) as Objectra.Content<T>;

				const objectra = new Objectra({
					identifier: objectInstance.constructor, 
					content: objectraContent,
					id: isReferenceSource ? referableReferences.indexOf(objectInstance) : void 0,
					hoistingReferences: instanceObjectraHoistings.length ? instanceObjectraHoistings : void 0,
				});

				return objectra;
			}

			throw new TransformatorMatchNotFoundError(objectInstance.constructor);
		}

		return objectraValueSerialization(value);
	}

	public instantiate(): InstanceType {
		const typeConstructorGenerator = (transformator: Transformator<Constructor | Function>) => (...typeArguments: unknown[]) => {
			try {
				if (isClass(transformator.type)) {
					return new transformator.type(...typeArguments);
				}

				return transformator.type(...typeArguments);							
			} catch (error) {
				throw new InvalidPassthroughArgumentError(transformator.type, error);
			}
		}

		const resolvedReferenceMap = new Map<Objectra, Objectra.Reference>();
		const awaitingReferenceObjectraMap = new Map<Objectra, string[]>();

		const drillObjectPath = (obj: any, path: string[]) => path.reduce((prev, key) => prev?.[key], obj);

		const keyPath: string[] = [];
		const objectraValueInstantiation: Objectra.ValueInstantiation = (objectra) => {
			// TODO Make function instantiation

			const { name, type, overload, content } = objectra;

			const createInstantiationBridge = (transformator: Transformator): Transformator.InstantiationBridge<any, any> => ({
				value: objectra,
				instantiate: objectraValueInstantiation,
				initialTransformator: transformator,
				keyPath,
			});

			// Block circular instantiation
			if (objectra.isReferenceDependence) {
				if (!objectra.id || !resolvedReferenceMap.has(objectra)) {
					awaitingReferenceObjectraMap.set(objectra, [...keyPath]);
					return undefined;
				}

				return resolvedReferenceMap.get(objectra);
			}

			objectra.hoistingReferences.forEach((hoistedObjectra) => {
				objectraValueInstantiation(hoistedObjectra);
			});

			// TODO Add support for other data types (ex. Map[<path>])
			const injectReferenceInstance = (instance: any, transformator: Transformator) => {
				const resolvedReferenceArray = Array.from(resolvedReferenceMap.keys());
				for (const [obtra, path] of awaitingReferenceObjectraMap) {
					const init = resolvedReferenceArray.find((ob) => ob.id === obtra.id);
					if (!init) {
						continue;
					}
					
					const relativePath = path.slice(keyPath.length);
					const lastKey = relativePath.pop()!;

					const drilledObject = drillObjectPath(instance, relativePath);
					drilledObject[lastKey] = resolvedReferenceMap.get(init);
				}
			}

			if (name) {
				const transformator = Transformator.getStatic(name);
				if (!transformator.instantiate) {
					throw new InstantiationMethodDoesNotExistError(name);
				}

				return transformator.instantiate(createInstantiationBridge(transformator));
			}
			
			if (type) {
				const transformator = typeof type === 'string' ?
					Transformator.getStaticByStringType(type) :
					Transformator.get(type, overload);

				const constructType = typeConstructorGenerator(transformator);
				const typeConstructorParams = transformator.type.length;
				
				if (transformator && transformator.instantiate) {
					const instance = transformator.instantiate(createInstantiationBridge(transformator));
					if (objectra.isReferenceSource) {
						resolvedReferenceMap.set(objectra, instance);
						injectReferenceInstance(instance, transformator);
					}

					return instance;
				}

				const useForceArgumentPassthrough = transformator.ignoreDefaultArgumentBehaviour && transformator.argumentPassthrough;
				if (isPrimitive(content) && (typeConstructorParams === 1 || useForceArgumentPassthrough)) {
					const instance = constructType(content);

					if (objectra.isReferenceSource) {
						resolvedReferenceMap.set(objectra, instance);
					}

					injectReferenceInstance(instance, transformator)

					return instance;
				}

				// TODO Overhaul
				if (!isClass(transformator.type)) {
					throw new Error(`Can not get superclasses of function`);
				}
				
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
						if (objectra.isReferenceSource) {
							resolvedReferenceMap.set(objectra, instance);
							injectReferenceInstance(instance, transformator)
						}

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

						const instance = constructType(value);
						if (objectra.isReferenceSource) {
							resolvedReferenceMap.set(objectra, instance);
							injectReferenceInstance(instance, transformator)
						}


						return instance;
					}

					if (typeConstructorParams === 0) {
						const instance = new transformator.type();
						superTransfarmator.instantiate({
							...createInstantiationBridge(transformator),
							instance,
						});

						if (objectra.isReferenceSource) {
							resolvedReferenceMap.set(objectra, instance);
							injectReferenceInstance(instance, transformator)
						}

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

	export type Reference = symbol | IterableEntity;

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
		readonly overload?: number;
		readonly id?: number;
		readonly hoistingReferences?: Objectra[] | undefined; 
		readonly content?: ContentType;
	}

	export type ValueSerialization = <T>(instance: T) => Objectra<Objectra.Content<T>, T>;
	export type ValueInstantiation = <K, T>(instance: Objectra<K, T>) => T;

	export type BackloopReferenceCreator = <T extends Objectra<Objectra.Content<any>>>(objectra: T) => Backloop.Reference<T>;
	export type BackloopReferenceResolver = <T extends Backloop.Reference>(representer: T) => Backloop.ReferenceResolve<T>;
	export type BackloopDuplex<T> = readonly [Backloop.Reference<Objectra<T>>, BackloopReferenceResolver];

	export type ReferenceAppearancePathMap = Map<Objectra.Reference, IterableEntity[][]>;
	export interface ObjectReferenceData {
		readonly referenceAppearancePathMap: ReferenceAppearancePathMap;
		readonly repeatingReferences: Objectra.Reference[];
	}
}

export * as errors from './errors';
export * as utils from './utils';
export * as transformators from './transformators';
export { Transformator } from './transformator';