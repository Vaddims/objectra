import { everyArrayElementIsEqual, FunctionType, FunctionTypeDeterminant, getFunctionType, isES3Primitive, isES5Primitive } from "./utils";
import { ObjectraCluster, ObjectraDescriptor, ObjectraDescriptorTuple } from "./objectra-cluster";
import { Backloop } from "./types/backloop.types";
import { Transformator } from "./transformator";
import './transformators';

import * as util from 'util';
import {
	InvalidPassthroughArgumentError, 
	InstantiationMethodDoesNotExistError,
	InvalidInstantiationArgumentQuantityError,
	TransformatorMatchNotFoundError,
	ForeignBackloopReferenceError,
	TransformatorNotFoundError, 
} from "./errors";

import type { 
	Constructor, 
	ES3Primitives, 
	ExtractArrayIndexes, 
	IndexableObject, 
	UnindexableArray,
	IterableEntity,
	Writeable,
} from "./types/util.types";

export class Objectra<ContentType extends Objectra.Content<any> = Objectra.Content<any>, InstanceType = any> {
	public readonly id?: number;
	public readonly identifier?: Objectra.Identifier;
	public readonly overload?: number;
	private readonly content?: ContentType;
	
	public readonly identifierIsConstructor: boolean;
	public readonly isReferenceHoist: boolean;
	private readonly hoistingReferences: Objectra[] = [];

	private cachedChildObjectraCluster?: Objectra.Cluster;
	private cachedDescendantObjectraCluster?: Objectra.Cluster;

	private constructor(init: Objectra.Init<ContentType>) {
		const { 
			identifier, 
			overload, 
			isReferenceHoist = false
		} = init;

		this.identifierIsConstructor = false;
		this.isReferenceHoist = isReferenceHoist;

		if (identifier) {
			if (typeof identifier !== 'string' && init.identifierIsConstructor) {
				this.identifier = identifier;
				this.identifierIsConstructor = true;
			} else {
				this.identifier = identifier;
			}
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

	public get isStructureEndpoint() {
		return isES3Primitive(this.content);
	}

	public get isDeclaration() {
		return 'content' in this;
	}

	public get isConsumer() {
		return typeof this.id === 'number' && !('content' in this);
	}

	public get childObjectras() {
		if (this.cachedChildObjectraCluster) {
			return this.cachedChildObjectraCluster;
		}

		if (!this.content || typeof this.content !== 'object' || this.content === null) {
			return this.cachedChildObjectraCluster = new Objectra.Cluster();
		}
		
		if (this.isStructureEndpoint) {
			return
		}
		
		const objectraDescriptorTuples: ObjectraDescriptorTuple[] = [];
		const entryTuples = Object.entries(this.content as IndexableObject<Objectra>);
		for (const [ key, subObjectra ] of entryTuples) {
			objectraDescriptorTuples.push([ subObjectra, {
				path: [key],
			} ]);
		}

		return new Objectra.Cluster(objectraDescriptorTuples)
	}

	public get descendantObjectras() {
		if (this.cachedDescendantObjectraCluster) {
			return this.cachedDescendantObjectraCluster;
		}

		if (!this.content || typeof this.content !== 'object' || this.content === null) {
			return this.cachedChildObjectraCluster = new Objectra.Cluster();
		}

		const objectraDescriptorTuples: ObjectraDescriptorTuple[] = [];
		registerSubTuples(this);
		
		for (let i = 0; i < objectraDescriptorTuples.length; i++) {
			registerSubTuples(...objectraDescriptorTuples[i]);
		}
		
		function registerSubTuples(objectra: Objectra, descriptor?: ObjectraDescriptor) {
			const {
				path = [],
			} = descriptor ?? {};

			if (objectra.isStructureEndpoint) {
				return;
			}

			for (const hoistingObjectra of objectra.hoistingReferences) {
				objectraDescriptorTuples.push([ hoistingObjectra, { 
					path: [...path],
				} ]);
			}

			const entryTuples = Object.entries(objectra.content as IndexableObject<Objectra>);
			for (const [ key, subObjectra ] of entryTuples) {
				objectraDescriptorTuples.push([ subObjectra, {
					path: path.concat(key),
				} ]);
			}
		}

		return new Objectra.Cluster(objectraDescriptorTuples);
	}

	public getContentReferenceBackloop() {
		const duplex = this.createBackloopReferenceDuplex();
		return duplex;
	}

	public contentIsInstanceOf(constructor: Constructor): boolean {
		if (!this.identifier) {
			return false;
		}

		const contentTransformator = Transformator.findAvailable(this.identifier, this.overload);	
		if (!contentTransformator) {
			return false;
		}

		return constructor === contentTransformator.type;
	}

	public compose(): InstanceType {
		const resolvedReferenceMap = new Map<Objectra, Objectra.Reference>();
		const awaitingReferenceObjectraMap = new Map<Objectra, string[]>();
		const iterableInstanceContents = new Map<Objectra.Reference, unknown[]>();
		const hoistingMap = new Map<number, Objectra>();
		const keyPath: string[] = [];

		const objectraValueInstantiation: Objectra.ValueInstantiation = (objectra) => {
			// Block circular instantiation
			if (objectra.isConsumer) {
				const resolvedInstance = getResolvedInstance(objectra);
				if (resolvedInstance) {
					return resolvedInstance;
				}

				const target = hoistingMap.get(objectra.id!);
				if (!target) {
					awaitingReferenceObjectraMap.set(objectra, [...keyPath]);
					return new Objectra.ReferenceInjection();
				}

				hoistingMap.delete(target.id!);
				const instance = objectraValueInstantiation(target);
				return instance;
			}

			if (typeof objectra.identifier === 'string') {
				const transformator = Transformator.getStatic(objectra.identifier);
				if (!transformator.instantiate) {
					throw new InstantiationMethodDoesNotExistError(objectra.identifier);
				}

				return transformator.instantiate(createInstantiationBridge(transformator));
			}
			
			if (typeof objectra.identifier !== 'undefined') {
				if (!objectra.identifierIsConstructor) {
					// TODO RWORK WITH IDS
					return objectra.identifier;
				}

				const transformator = Transformator.get(objectra.identifier, objectra.overload);
				const constructType = typeConstructorGenerator(transformator);
				const typeConstructorParams = transformator.type.length;

				objectra.hoistingReferences.forEach((objectra) => hoistingMap.set(objectra.id!, objectra));
				
				if (transformator && transformator.instantiate) {
					if (objectra.isDeclaration) {
						const instance = constructType();
						if (objectra.isDeclaration) {
							resolvedReferenceMap.set(objectra, instance);
						}

						return transformator.instantiate({
							...createInstantiationBridge(transformator),
							instance,
						});
					}

					const instance = transformator.instantiate(createInstantiationBridge(transformator));
					if (objectra.isDeclaration) {
						resolvedReferenceMap.set(objectra, instance);
					}

					return instance;
				}

				const useForceArgumentPassthrough = transformator.ignoreDefaultArgumentBehaviour && transformator.argumentPassthrough;
				if (isES5Primitive(objectra.content) && (typeConstructorParams === 1 || useForceArgumentPassthrough)) {
					const instance = constructType(objectra.content);
					if (objectra.isDeclaration) {
						resolvedReferenceMap.set(objectra, instance);
					}

					return instance;
				}

				// TODO Overhaul
				if (!FunctionTypeDeterminant.isConstructor(transformator.type)) {
					throw new Error(`Can not get superclasses of function`);
				}
				
				const superTransformators = Transformator.getSuperTransformators(transformator.type);
				const instantiationTransformator = Array.from(superTransformators).find(transformator => transformator.instantiate);
				if (!instantiationTransformator) {
					throw new InvalidInstantiationArgumentQuantityError(objectra.identifier);
				}

				if (transformator.useSerializationSymbolIterator) {
					const instance = constructType();
					resolvedReferenceMap.set(objectra, instance);
					const value = instantiationTransformator.instantiate!(createInstantiationBridge(transformator)) as any[];
					iterableInstanceContents.set(instance, value);
					return instance;
				}

				if (transformator['argumentPassthroughPropertyKeys'].length > 0) {
					const instantiationOptions = createInstantiationBridge(transformator);
					const value = instantiationTransformator.instantiate!(instantiationOptions);
					injectInstanceUnfilledReferences(value);

					const propKeys = transformator['argumentPassthroughPropertyKeys'];
					const args = propKeys.map(key => value[key]);
					
					const instance = constructType(...args);
					if (objectra.isDeclaration) {
						resolvedReferenceMap.set(objectra, instance);
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
					const value = instantiationTransformator.instantiate!(createInstantiationBridge(transformator));

					const instance = constructType(value);
					if (objectra.isDeclaration) {
						resolvedReferenceMap.set(objectra, instance);
					}

					return instance;
				}

				if (typeConstructorParams === 0) {
					const instance = new transformator.type();
					if (objectra.isDeclaration) {
						resolvedReferenceMap.set(objectra, instance);
					}

					instantiationTransformator.instantiate!({
						...createInstantiationBridge(transformator),
						instance,
					});

					return instance;
				}
			}

			if (objectra.content === null) {
				return null;
			}

			return undefined;

			function createInstantiationBridge(transformator: Transformator): Transformator.InstantiationBridge<any, any> {
				return {
					value: objectra,
					instantiate: objectraValueInstantiation,
					initialTransformator: transformator,
					keyPath,
				}
			};
		}
		
		const finalInstance = objectraValueInstantiation(this);
		injectInstanceUnfilledReferences(finalInstance);
		return finalInstance;

		function typeConstructorGenerator(transformator: Transformator<Constructor | Function>) {
			return function (...typeArguments: unknown[]) {
				try {
					if (FunctionTypeDeterminant.isConstructor(transformator.type)) {
						return new transformator.type(...typeArguments);
					}
	
					return transformator.type(...typeArguments);							
				} catch (error) {
					throw new InvalidPassthroughArgumentError(transformator.type, error);
				}
			}
		}

		function getResolvedInstance(target: Objectra) {
			const resolvedReferences = Array.from(resolvedReferenceMap);
			for (const [resolvedObjectra, resolvedInstance] of resolvedReferences) {
				if (resolvedObjectra.id === target.id) {
					return resolvedInstance;
				}
			}
		}

		function injectInstanceUnfilledReferences(instance: any) {
			for (const [objectra, appearancePath] of awaitingReferenceObjectraMap) {
				const awaitingReferenceInstance = getResolvedInstance(objectra);
				if (!awaitingReferenceInstance) {
					continue;
				}

				const fullRelativePath = appearancePath.slice(keyPath.length);

				let drilledObject = instance;
				for (let i = 0; i < fullRelativePath.length; i++) {
					const key = fullRelativePath[i];
					if (!drilledObject) {
						continue;
					}

					// Fill all entry unfilled references
					const transformator = Transformator.get(drilledObject.constructor);
					if (transformator.useSerializationSymbolIterator) {
						if (i + transformator.symbolIteratorEntryDepth === fullRelativePath.length) {
							const entries = iterableInstanceContents.get(drilledObject);
							if (!entries) {
								continue;
							}

							injectInstanceUnfilledReferences(entries);
						}
					}

					// Write the reference to an endpoint
					const keyIsLast = key === fullRelativePath.at(-1);
					if (keyIsLast) {
						drilledObject = drilledObject[key];
						break;
					}

					// Drill the object
					if (transformator.useSerializationSymbolIterator) {
						const entries = iterableInstanceContents.get(drilledObject);
						if (!entries) {
							throw Error('No entries');
						}
						drilledObject = entries[Number(key)];
					} else {
						drilledObject = drilledObject[key];
					}
				}
			}

			// Apply all entries to their corresponding iterable objects 
			for (const [reference, entries] of iterableInstanceContents) {
				const transformator = Transformator.get(reference.constructor);
				for (const entry of entries) {
					transformator.setter(reference, entry);
				}
			}
		}
	}

	public toModel(): Objectra.Model {
		const createModel = (objectra: Objectra) => {
			if (objectra.identifier && !Transformator.exists(objectra.identifier, objectra.overload)) {
				throw new TransformatorNotFoundError(objectra.identifier);
			}
			
			const model: Writeable<Objectra.Model> = {};
			
			if (typeof objectra.identifier === 'string') {
				model.name = objectra.identifier;
			} else if (typeof objectra.identifier === 'function') {
				if (objectra.identifierIsConstructor) {
					model.type = objectra.identifier.name;
				} else {
					model.type = Function.name;
					model.name = objectra.identifier.name;
				}
			}

			if (typeof objectra.overload === 'number') {
				model.overload = objectra.overload;
			}

			if (typeof objectra.id === 'number') {
				model.id = objectra.id;
			}

			if (objectra.hoistingReferences?.length > 0) {
				model.hoisitings = objectra.hoistingReferences.map(createModel);
			}
			
			model.content = {};
			if (objectra.content) {
				if (objectra.isStructureEndpoint) {
					model.content = objectra.content;
				} else {
					for (const key in objectra.content) {
						model.content[key] = createModel(objectra.content[key]);
					}
				}

			}
			
			return model as Objectra.Model;
		}

		return createModel(this);
	}
	
	private createBackloopReferenceDuplex(): Objectra.BackloopDuplex<ContentType> {
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

	public static from<T>(value: T): Objectra<Objectra.Content<T>, T> {
		const objectReferenceData = Objectra.getObjectData(value);
		const referenceHoistingParentMap = Objectra.getReferenceHoistingParents(objectReferenceData);
		const referableReferences = new Set<Objectra.Reference>();
		
		const { repeatingReferences } = objectReferenceData;
		const referenceIdentifiers = new Map<Objectra.Reference, number>(
			Array.from(repeatingReferences).map((reference, index) => [reference, index])
		);

		const objectraValueSerialization: Objectra.ValueSerialization = <T>(instance: T) => {
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
			const referenceIsOrigin = 
				instanceIsReference
				&& repeatingReferences.has(objectInstance)
				&& !referableReferences.has(objectInstance);

			const referenceIsClassConstructor = typeof objectInstance === 'function' && FunctionTypeDeterminant.isConstructor(objectInstance);

			const referenceShouldInstantiate =
				typeof objectInstance === 'function' && FunctionTypeDeterminant.isConstructor(objectInstance)
				? false
				: referenceIsOrigin;

			if (!referenceShouldInstantiate && repeatingReferences.has(objectInstance) && referableReferences.has(objectInstance)) {
				const id = referenceIdentifiers.get(objectInstance);
				if (typeof id === 'undefined') {
					throw new Error('Internal id not found')
				}

				return new Objectra({ id });
			}
			
			if (!referenceIsClassConstructor) {
				referableReferences.add(objectInstance);
			}
			
			const instanceTransformator = Transformator.get(objectInstance.constructor as Constructor);
			const superTransformators = Transformator.getSuperTransformators(objectInstance.constructor as Constructor);

			const transformators: Transformator[] = [...superTransformators];
			if (instanceTransformator) {
				transformators.unshift(instanceTransformator);
			}

			const serializationSuperTransformator = Array.from(transformators).find(transformator => transformator.serialize);
			if (!serializationSuperTransformator) {
				throw new TransformatorMatchNotFoundError(objectInstance.constructor);
			}

			const instanceHoistingReferences = Array
				.from(referenceHoistingParentMap)
				.filter(([, parent]) => parent === objectInstance)
				.map(([reference]) => reference);

			const instanceObjectraHoistings = instanceHoistingReferences.map(objectraValueSerialization);

			const id = referenceShouldInstantiate ? referenceIdentifiers.get(objectInstance) : void 0;
			
			if (typeof objectInstance === 'function') {
				return new Objectra({
					identifier: objectInstance,
					isReferenceHoist: referenceShouldInstantiate,
					id,
				});
			} 

			const objectraContent = serializationSuperTransformator.serialize!({
				instance: objectInstance,
				objectrafy: objectraValueSerialization,
				instanceTransformator,
			}) as Objectra.Content<T>;

			const objectra = new Objectra({
				identifier: objectInstance.constructor, 
				identifierIsConstructor: true,
				content: objectraContent,
				hoistingReferences: instanceObjectraHoistings.length ? instanceObjectraHoistings : void 0,
				isReferenceHoist: referenceShouldInstantiate,
				id,
			});

			return objectra;
		}

		const result = objectraValueSerialization(value);
		return result;
	}

	public static fromModel(model: Objectra.Model | string): Objectra {
		const parseModel = (target: Objectra.Model): Objectra => {
			const constructObjectra = (identifier: Objectra.Identifier, isConstructor: boolean) => {
				const hoistings: Objectra[] = Array.from(target.hoisitings?.map(parseModel) ?? []);

				let content: Objectra.ContentStructure<Objectra>;

				if (isES3Primitive(target.content)) {
					content = target.content;
				} else if (Array.isArray(target.content)) {
					content = target.content.map(parseModel); 
				} else {
					for (const key in target.content) {
						content = {};
						content[key] = parseModel(target.content[key]);
					}
				}
				
				return new Objectra({
					content,
					id: target.id,
					identifier,
					identifierIsConstructor: isConstructor,
					hoistingReferences: hoistings,
					overload: target.overload,
				});
			}

			if (target.type) {
				const targetStringIdentifier = typeof target.name === 'string' ? target.name : target.type;

				if (typeof target.name === 'string') {
					const transformator = Transformator.getStaticByStringType(target.name, target.overload);
					return constructObjectra(transformator.type, false);
				}

				const transformator = Transformator.getStaticByStringType(targetStringIdentifier, target.overload);
				return constructObjectra(transformator.type, true);
			}

			throw new Error('Parsing model by instance specification name is not supported yet');
			// TODO ADD model parsing for instance specification names
		}

		return parseModel(typeof model === 'string' ? JSON.parse(model) : model);
	}

	public static duplicate<T>(value: T) {
		return Objectra.from(value).compose();
	}

	private static isIterableEntity(target: unknown): target is IterableEntity {
		return typeof target === 'object' && target !== null;
	}

	private static isValueReference(target: unknown): target is Objectra.Reference {
		return Objectra.isIterableEntity(target) || typeof target === 'function' || typeof target === 'symbol';
	}

	public static getObjectData(value: unknown) {
		const referenceAppearancePathMap: Objectra.ReferenceAppearancePathMap = new Map();
		const repeatingReferences = new Set<Objectra.Reference>();
		let actualDepth = 0; // The depth with circular references counting in (Infinite when circular)
		let shallowDepth = 0; // The depth with circular reference block
		analyzeValue(value);

		return {
			referenceAppearancePathMap,
			repeatingReferences,
			actualDepth,
			shallowDepth,
		}

		function analyzeValue(target: unknown, pathStack: IterableEntity[] = []) {
			if (!Objectra.isValueReference(target) || typeof target.constructor !== 'function') {
				return;
			}

			const currentPathStack = [...pathStack];
			const transformator = Transformator.get(target.constructor);
			const registeredApearencePaths = referenceAppearancePathMap.get(target);

			if (registeredApearencePaths) {
				repeatingReferences.add(target);
				if (Objectra.isIterableEntity(target) && pathStack.includes(target)) {
					actualDepth = Infinity;
					return; // The object has circular reference to itself
				}

				referenceAppearancePathMap.set(target, [...registeredApearencePaths, currentPathStack])
			} else {
				referenceAppearancePathMap.set(target, [currentPathStack]);
			}
		
			if (shallowDepth < currentPathStack.length) {
				shallowDepth++;
			}

			if (actualDepth < currentPathStack.length) {
				actualDepth++;
			}
			
			if (typeof target === 'symbol' || typeof target === 'function') {
				return;
			}

			const subfieldPath = [...pathStack, target];

			if (Array.isArray(target)) {
				target.forEach(element => analyzeValue(element, subfieldPath));
				return;
			}

			if (transformator.useSerializationSymbolIterator && typeof target[Symbol.iterator] === 'function') {
				const entries = (target as IndexableObject<any>)[Symbol.iterator]();
				for (const entry of entries) {
					analyzeValue(entry, subfieldPath);
				}
				return;
			} 

			const indexableObjectKeys = Object.getOwnPropertyNames(target);
			for (const key of indexableObjectKeys) {
				analyzeValue(target[key], subfieldPath);
			}
		}
	}

	private static getReferenceCommonParent(referenceAppearancePaths: IterableEntity[][]) {
		const referencePath = referenceAppearancePaths[0];
		let depth = -1;
		let pathsShareParent = true;

		do {
			depth++;
			const nextDepth = depth + 1;
			const parallelPathElements = referenceAppearancePaths.map(path => path[nextDepth]);
			pathsShareParent = everyArrayElementIsEqual(parallelPathElements);
		} while (depth < referencePath.length - 1 && pathsShareParent);

		return referencePath[depth];
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

	public static Cluster = ObjectraCluster;

	private static readonly ReferenceInjection = class ReferenceInjection {};
}

export namespace Objectra {
	export type Identifier = Constructor | Function | string;
	export type Reference = symbol | IterableEntity | Function;

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

	export enum ReferenceType {
		None,
		Origin,
		Depended,
	}

	export interface Init<ContentType extends Objectra.Content<any>> {
		readonly identifier?: Identifier;
		readonly identifierIsConstructor?: boolean;
		readonly overload?: number;
		readonly id?: number;
		readonly hoistingReferences?: Objectra[] | undefined;
		readonly isReferenceHoist?: boolean;
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
		readonly repeatingReferences: Set<Objectra.Reference>;
	}

	export interface Model {
		readonly type?: string; // Class constructor name
		readonly name?: string; // Instance specification name
		readonly overload?: number; // Overload for class / instance that have the same specification / constructor name
		readonly content?: ContentStructure<Model> | undefined;
		readonly hoisitings?: Model[];
		readonly id?: number;
	}

	export type Cluster = ObjectraCluster;
}

export * as errors from './errors';
export * as utils from './utils';
export * as transformators from './transformators';
export { Transformator } from './transformator';

const number = 42;
const string = 'Hello world';
const boolean = true;
const complexMap = new Map<string, unknown>([
	['number', number],
	['string', string],
	['boolean', boolean],
	['array', [number, string, boolean]],
	['object', { number, string, boolean }],
	['set', new Set([number, string, boolean])],
]);

console.dir(Objectra.from(complexMap).descendantObjectras.size)