import { everyArrayElementIsEqual, FunctionType, FunctionTypeDeterminant, getFunctionType, isES3Primitive, isES5Primitive } from "./utils";
import { ObjectraCluster, ObjectraDescriptor, ObjectraDescriptorTuple } from "./objectra-cluster";
import { Backloop } from "./types/backloop.types";
import { Transformator } from "./transformator";
import './transformators';

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
		return typeof this.id === 'number' && typeof this.content === 'undefined';
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

		const addResolvedReference = (objectra: Objectra, reference: Objectra.Reference) => {
			if (typeof objectra.id !== 'number') {
				return resolvedReferenceMap;
			}
			
			resolvedReferenceMap.set(objectra, reference);
			injectInstanceUnfilledReferences(reference);
			return resolvedReferenceMap;
		}

		const objectraValueInstantiation: Objectra.ValueInstantiation = (objectra) => {
			if (objectra.isConsumer) {
				// ! Objectra must be injected from its definition
				// Definition -> The main reference used for all the required reference injections

				try {
					// Apply the reference definition if it is already resolved
					const resolvedInstance = getResolvedInstance(objectra);
					return resolvedInstance;
				} catch {}

				const target = hoistingMap.get(objectra.id!);
				if (target) {
					// Proceed to instantiate the already explored (but not instantiated) definition
					hoistingMap.delete(target.id!);
					const instance = objectraValueInstantiation(target);
					return instance;
				}

				// Definition has been not explored yet (Inject temporary placeholder)
				awaitingReferenceObjectraMap.set(objectra, [...keyPath]);
				return new Objectra.ReferenceInjection();
			}

			if (typeof objectra.identifier === 'string') {
				// ! Next code will not be executed. From model already covers the current functionality.
				// TODO Add instantiation from nammed identifiers
				const transformator = Transformator.getStatic(objectra.identifier);
				if (!transformator.instantiate) {
					throw new InstantiationMethodDoesNotExistError(objectra.identifier);
				}

				return transformator.instantiate(createInstantiationBridge(transformator));
			}

			if (typeof objectra.identifier === 'undefined') {
				// ! Cover edge cases (Only undefined and null are treated in this special form)
				if (objectra.content === null) {
					return null;
				}
	
				return undefined;
			}
			
			if (!objectra.identifierIsConstructor) {
				// TODO Resee what happens here. Class definition edge case?
				return objectra.identifier;
			}

			const transformator = Transformator.get(objectra.identifier, objectra.overload);
			const constructType = typeConstructorGenerator(transformator);
			const typeConstructorParams = transformator.type.length;

			objectra.hoistingReferences.forEach((objectra) => {
				if (typeof objectra.id === 'undefined') {
					// TODO Resee
					return;
				}

				hoistingMap.set(objectra.id!, objectra)
			});
			
			if (transformator && transformator.instantiate) {
				// ! Custom instantiations
				if (objectra.isDeclaration) {
					const instance = constructType();

					const returnInstance = transformator.instantiate({
						...createInstantiationBridge(transformator),
						instance,
					});

					// TODO Resee
					addResolvedReference(objectra, returnInstance);

					return returnInstance;
				}

				const instance = transformator.instantiate(createInstantiationBridge(transformator));
				return instance;
			}

			const useForceArgumentPassthrough = transformator.ignoreDefaultArgumentBehaviour && transformator.argumentPassthrough;
			if (isES5Primitive(objectra.content) && (typeConstructorParams === 1 || useForceArgumentPassthrough)) {
				// ! Bundle all properties to one constructor argument object (Ignore all argument rules)
				const instance = constructType(objectra.content);
				if (objectra.isDeclaration) {
					addResolvedReference(objectra, instance);
				}

				return instance;
			}

			if (!FunctionTypeDeterminant.isConstructor(transformator.type)) {
				// ! Transformator type is not a constructor [but function] (Edge case)
				// TODO Resee
				throw new Error(`Can not get superclasses of function`);
			}
			
			// ! Search to the nearest transformator with a defined instantiation function
			const superTransformators = Transformator.getSuperTransformators(transformator.type);
			const instantiationTransformator = Array.from(superTransformators).find(transformator => transformator.instantiate);
			if (!instantiationTransformator) {
				// TODO define class error
				throw 'Ancestor with instantiation method not found';
				// throw new InvalidInstantiationArgumentQuantityError(objectra.identifier);
			}

			if (transformator.useSerializationSymbolIterator) {
				// ! Symbol iterator strucure
				// TODO Add flags (argumentPassthrough) for better instantiation
				const instance = constructType();
				addResolvedReference(objectra, instance);
				const returnInstance = instantiationTransformator.instantiate!(createInstantiationBridge(transformator)) as any[];
				iterableInstanceContents.set(instance, returnInstance);
				return instance;
			}

			if (transformator['argumentPassthroughPropertyKeys'].length > 0) {
				// ! Resolve constructor with prewritten properties
				const instantiationOptions = createInstantiationBridge(transformator);
				const value = instantiationTransformator.instantiate!(instantiationOptions);

				const propKeys = transformator['argumentPassthroughPropertyKeys'];
				const args = propKeys.map(key => value[key]);
				
				const instance = constructType(...args);
				if (objectra.isDeclaration) {
					addResolvedReference(objectra, instance);
				}

				const unusedKeys = Object.keys(value).filter(key => 
					!transformator['argumentPassthroughPropertyKeys'].includes(key)
				);

				for (const key of unusedKeys) {
					instance[key] = value[key];
				}

				injectInstanceUnfilledReferences(instance);
				return instance;
			}

			if (transformator.argumentPassthrough && (transformator.ignoreDefaultArgumentBehaviour || typeConstructorParams === 1)) {
				// ! Bundle all properties to one constructor argument object
				// TODO Mark under experimental flag or remove
				const value = instantiationTransformator.instantiate!(createInstantiationBridge(transformator));

				const instance = constructType(value);
				if (objectra.isDeclaration) {
					addResolvedReference(objectra, instance);
				}

				return instance;
			}

			if (typeConstructorParams === 0) {
				// ! Pure constructor call
				const instance = new transformator.type();
				if (objectra.isDeclaration) {
					addResolvedReference(objectra, instance);
				}

				instantiationTransformator.instantiate!({
					...createInstantiationBridge(transformator),
					instance,
				});

				return instance;
			}

			// TODO Resee edge cases
			throw `Unexpected error while instantiating. Possible problems (Did not register ${objectra.identifier.name} class)`

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

			throw null;
		}

		function injectInstanceUnfilledReferences(instance: any) {
			for (const [objectra, appearancePath] of awaitingReferenceObjectraMap) {
				let resolution: Objectra.Reference;
				try {
					resolution = getResolvedInstance(objectra);
				} catch {
					continue;
				}

				const fullRelativePath = [...appearancePath].slice(keyPath.length);

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
						drilledObject[key] = resolution;
						awaitingReferenceObjectraMap.delete(objectra);
						break;
					}

					if (transformator.useSerializationSymbolIterator) {
						const entries = iterableInstanceContents.get(drilledObject);
						if (!entries) {
							return;
						}

						drilledObject = entries[Number(key)];
						continue;
					}
					
					drilledObject = drilledObject[key];
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
			if (objectra.identifier && !Transformator.staticExists(objectra.identifier, objectra.overload)) {
				throw new TransformatorNotFoundError(objectra.identifier);
			}
			
			const model: Writeable<Objectra.Model> = {};
			
			if (typeof objectra.identifier === 'string') {
				model.n = objectra.identifier;
			} else if (typeof objectra.identifier === 'function') {
				if (objectra.identifierIsConstructor) {
					model.t = objectra.identifier.name;
				} else {
					model.t = Function.name;
					model.t = objectra.identifier.name;
				}
			}

			if (typeof objectra.overload === 'number') {
				model.o = objectra.overload;
			}

			if (typeof objectra.id === 'number') {
				model.id = objectra.id;
			}

			if (objectra.hoistingReferences?.length > 0) {
				model.h = objectra.hoistingReferences.map(createModel);
			}
			
			if (typeof objectra.content !== 'undefined') {
				if (objectra.isStructureEndpoint) {
					model.c = objectra.content;
				} else if (Array.isArray(objectra.content)) {
					model.c = objectra.content.map(createModel);
				} else {
					model.c = {};
					for (const key in objectra.content) {
						model.c[key] = createModel(objectra.content[key]);
					}
				}
			}

			if (objectra.identifierIsConstructor) {
				model.iic = objectra.identifierIsConstructor;
			}

			if (objectra.isReferenceHoist) {
				model.irh = objectra.isReferenceHoist;
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
			const referenceIsOrigin = instanceIsReference && repeatingReferences.has(objectInstance) && !referableReferences.has(objectInstance);
			const referenceIsClassConstructor = typeof objectInstance === 'function' && FunctionTypeDeterminant.isConstructor(objectInstance);
			const referenceShouldInstantiate = referenceIsClassConstructor ? false : referenceIsOrigin;

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
			const constructObjectra = (identifier?: Objectra.Identifier) => {
				const hoistings: Objectra[] = Array.from(target.h?.map(parseModel) ?? []);

				let init: Writeable<Objectra.Init<any>> = {};

				if (typeof target.c !== 'undefined') {
					if (isES3Primitive(target.c)) {
						init.content = target.c;
					} else if (Array.isArray(target.c)) {
						init.content = target.c.map(parseModel); 
					} else {
						init.content = {};
						for (const key in target.c) {
							init.content[key] = parseModel(target.c[key]);
						}
					}
				}
				
				return new Objectra({
					...init,
					id: target.id,
					identifier,
					identifierIsConstructor: target.iic ?? false,
					hoistingReferences: hoistings,
					overload: target.o,
					isReferenceHoist: target.irh ?? false,
				});
			}

			if (target.t) {
				const targetStringIdentifier = typeof target.n === 'string' ? target.n : target.t;

				if (typeof target.n === 'string') {
					const transformator = Transformator.getStaticByStringType(target.n, target.o);
					return constructObjectra(transformator.type);
				}

				const transformator = Transformator.getStaticByStringType(targetStringIdentifier, target.o);
				return constructObjectra(transformator.type);
			}

			const projection: any = {}

			if (typeof target.c !== 'undefined') {
				projection.content = target.c;
			}

			return new Objectra({
				...projection,
				id: target.id,
				identifierIsConstructor: target.iic ?? false,
				hoistingReferences: target.h?.map(parseModel),
				isReferenceHoist: target.irh ?? false,
				overload: target.o,
			})

			// throw new Error('Parsing model by instance specification name is not supported yet');
			// TODO ADD model parsing for instance specification names
		}

		return parseModel(typeof model === 'string' ? JSON.parse(model) : model);
	}

	public static duplicate<T>(value: T) {
		return Objectra.from(value).compose();
	}

	public static toModel<T>(value: T): Objectra.Model {
		return Objectra.from(value).toModel();
	}

	public static composeFromModel(model: Objectra.Model | string) {
		return Objectra.fromModel(model).compose();
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

			const indexableObjectKeys = transformator.getMaskedObjectPropertyNames(target)
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
		readonly t?: string; // Class constructor name
		readonly n?: string; // Instance specification name
		readonly o?: number; // Overload for class / instance that have the same specification / constructor name
		readonly c?: ContentStructure<Model> | undefined;
		readonly h?: Model[];
		readonly id?: number;
		readonly irh?: boolean;
		readonly iic?: boolean;
	}

	export type Cluster = ObjectraCluster;
}

export * as errors from './errors';
export * as utils from './utils';
export * as transformators from './transformators';
export { Transformator } from './transformator';