import { everyArrayElementIsEqual, FunctionType, FunctionTypeDeterminant, getFunctionType, isES3Primitive, isES6Primitive } from "./utils";
import { ObjectraCluster } from "./objectra-cluster";
import { Backloop } from "./types/backloop.types";
import { Transformator } from "./transformator";
import './transformators';

import {
	InvalidPassthroughArgumentError, 
	InstantiationMethodDoesNotExistError,
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
	
	public readonly isStructureDeclaration: boolean;
	private readonly hoistingReferences: Objectra[] = [];

	private cachedChildObjectraCluster?: Objectra.Cluster;
	private cachedDescendantObjectraCluster?: Objectra.Cluster;

	private constructor(init: Objectra.Init<ContentType>) {
		const { 
			identifier, 
			overload,
		} = init;

		this.isStructureDeclaration = false;

		if (identifier) {
			if (typeof identifier !== 'string' && init.isStructureDeclaration) {
				this.identifier = identifier;
				this.isStructureDeclaration = true;
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

	/** Indicates if the objectra has an identifier. If not, it represents the value `undefined` or `null` */
	public get isIdentified() {
		return typeof this.identifier !== 'undefined';
	}

	/** Indicates if the Objectra holds an instance reference (object by reference) which was found more than one time in the initial value */
	public get isReference() {
		return typeof this.id === 'number';
	}

	/** Indicates if the Objectra will instantiate itself on instantiation, and will inject its instance to the reference injection placeholders */
	public get isReferenceDeclaration() {
		return this.isReference && typeof this.content !== 'undefined';
	}

	/** Indicates if this Objectra will act as a reference injection placeholder on instantiation. It will not instantiate itself, but will wait for its definition to inject the reference to the placeholder */
	public get isReferenceConsumer() {
		return this.isReference && typeof this.content === 'undefined';
	}

	/** Indicates if the Objectra will instantiate itself on instantiation */
	public get isDeclaration() {
		return this.isIdentified && !this.isReferenceConsumer;
	}

	/** The children of the objectra content */
	public get childObjectras() {
		if (this.cachedChildObjectraCluster) {
			return this.cachedChildObjectraCluster;
		}

		if (this.isStructureEndpoint || !this.content || typeof this.content !== 'object' || this.content === null) {
			return this.cachedChildObjectraCluster = new Objectra.Cluster();
		}
		
		const contentEntries = Object.entries(this.content as IndexableObject<Objectra>);
		const objectraEntries: ObjectraCluster.Entry[] = contentEntries.reduce((entries, [key, subObjectra]) => {
			return entries.concat([
				subObjectra, 
				{ path: [key] },
			]);
		}, [] as ObjectraCluster.Entry[]);

		return this.cachedChildObjectraCluster = new Objectra.Cluster(objectraEntries);
	}

	/** The children of the objectra tree */
	public get descendantObjectras() {
		if (this.cachedDescendantObjectraCluster) {
			return this.cachedDescendantObjectraCluster;
		}

		if (!this.content || typeof this.content !== 'object' || this.content === null) {
			return this.cachedChildObjectraCluster = new Objectra.Cluster();
		}

		const objectraClusterEntries: ObjectraCluster.Entry[] = [];
		registerEntry(this);
		
		for (let i = 0; i < objectraClusterEntries.length; i++) {
			registerEntry(...objectraClusterEntries[i]);
		}
		
		function registerEntry(objectra: Objectra, descriptor?: ObjectraCluster.Entry.Descriptor) {
			const {
				path = [],
			} = descriptor ?? {};

			if (objectra.isStructureEndpoint) {
				return;
			}

			for (const hoistingObjectra of objectra.hoistingReferences) {
				objectraClusterEntries.push([ hoistingObjectra, {
					path: [...path],
				} ]);
			}

			const contentEntries = Object.entries(objectra.content as IndexableObject<Objectra>);
			for (const [ key, subObjectra ] of contentEntries) {
				objectraClusterEntries.push([ subObjectra, {
					path: path.concat(key),
				} ]);
			}
		}

		return new Objectra.Cluster(objectraClusterEntries);
	}

	/** Create an easy to use, */
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
		const awaitingDeclarationLocatedConsumer = new Map<Objectra, string[]>();
		const resolvedObjectraReferenceDefinition = new Map<Objectra, Objectra.Reference>();
		const unresolvedDeclarationById = new Map<number, Objectra>();
		const iterableInstanceContents = new Map<Objectra.Reference, unknown[]>();
		const contextPropertyKeyPath: string[] = [];

		const addResolvedReference = (objectra: Objectra, reference: Objectra.Reference) => {
			if (typeof objectra.id !== 'number') {
				return;
			}
			
			resolvedObjectraReferenceDefinition.set(objectra, reference);
			injectNewReferenceDefinitionsInto(reference);
		}

		const composeValueWithinContext: Objectra.ValueInstantiation = (objectra) => {
			if (objectra.isReferenceConsumer) {
				// * Placeholder for reference injection

				const resolvedReferenceDefinition = getResolvedReferenceDefinition(objectra);
				if (resolvedReferenceDefinition !== null) {
					return resolvedReferenceDefinition;
				}

				const declarationObjectra = unresolvedDeclarationById.get(objectra.id!);
				if (declarationObjectra) {
					// Proceed to instantiate the already explored (but not instantiated) declaration
					unresolvedDeclarationById.delete(declarationObjectra.id!);
					const definitionInstance = composeValueWithinContext(declarationObjectra);
					// Instance becomes a definition from declaration beacause it can be used for injections
					return definitionInstance;
				}

				// Declaration has been not explored yet (Inject temporary placeholder)
				awaitingDeclarationLocatedConsumer.set(objectra, [...contextPropertyKeyPath]);
				return new Objectra.UnresolvedReferencePlaceholder();
			}

			if (!objectra.isIdentified) {
				if (objectra.content === null) {
					return null;
				}
	
				return undefined;
			}
			
			if (objectra.isStructureDeclaration) {
				return objectra.identifier;
			}

			if (typeof objectra.identifier === 'string') {
				// ! Next code will not be executed. From model already covers the current functionality.
				// TODO Add instantiation from named identifiers
				const transformator = Transformator.getStatic(objectra.identifier);
				if (!transformator.instantiate) {
					throw new InstantiationMethodDoesNotExistError(objectra.identifier);
				}

				return transformator.instantiate(createInstantiationBridge(transformator));
			}

			const transformator = Transformator.get(objectra.identifier!, objectra.overload);
			const constructInstanceWithArguments = createInstanceConstructor(transformator);
			const typeArgumentLenght = transformator.type.length;

			// TODO Add id to class declarations and use them as hoisting injections
			objectra.hoistingReferences.forEach((objectra) => {
				unresolvedDeclarationById.set(objectra.id!, objectra)
			});
			
			if (transformator.instantiate) {
				const preinstance = transformator.argumentPassthrough ? constructInstanceWithArguments() : undefined;
				const instance = transformator.instantiate({
					...createInstantiationBridge(transformator),
					instance: preinstance,
				});

				addResolvedReference(objectra, instance);

				return instance;
			}

			const useForceArgumentPassthrough = transformator.ignoreDefaultArgumentBehaviour && transformator.argumentPassthrough;
			if (isES6Primitive(objectra.content) && (typeArgumentLenght === 1 || useForceArgumentPassthrough)) {
				const instance = constructInstanceWithArguments(objectra.content);
				addResolvedReference(objectra, instance);
				return instance;
			}
			

			if (!FunctionTypeDeterminant.isConstructor(transformator.type)) {
				throw new Error('Invalid schema');
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
				// TODO Add flags (argumentPassthrough) for better instantiation
				const instance = constructInstanceWithArguments();
				addResolvedReference(objectra, instance);

				const iteratorContents = instantiationTransformator.instantiate!(createInstantiationBridge(transformator)) as any[];
				iterableInstanceContents.set(instance, iteratorContents);
				return instance;
			}

			if (transformator['argumentPassthroughPropertyKeys'].length > 0) {
				// ! Resolve constructor with prewritten properties
				const instantiationOptions = createInstantiationBridge(transformator);
				const content = instantiationTransformator.instantiate!(instantiationOptions);

				const argumentPassthroughPropertyKeys = transformator['argumentPassthroughPropertyKeys'];
				const constructorArguments = argumentPassthroughPropertyKeys.map(key => content[key]);
				
				const instance = constructInstanceWithArguments(...constructorArguments);
				addResolvedReference(objectra, instance);

				const redefineKeys = Object.keys(content).filter(key => 
					!transformator['argumentPassthroughPropertyKeys'].includes(key) &&
					!transformator['propertyExclusionMask'].includes(key)
				);

				for (const key of redefineKeys) {
					instance[key] = content[key];
				}

				return instance;
			}

			if (transformator.argumentPassthrough && (typeArgumentLenght === 1 || transformator.ignoreDefaultArgumentBehaviour)) {
				// ! Bundle all properties to one constructor argument object
				// TODO Mark under experimental flag or remove
				const content = instantiationTransformator.instantiate!(createInstantiationBridge(transformator));

				const instance = constructInstanceWithArguments(content);
				addResolvedReference(objectra, instance);
				return instance;
			}

			if (typeArgumentLenght === 0) {
				// ! Pure constructor call
				const instance = constructInstanceWithArguments();
				addResolvedReference(objectra, instance);

				instantiationTransformator.instantiate!({
					...createInstantiationBridge(transformator),
					instance,
				});

				return instance;
			}

			// TODO Resee edge cases
			throw `Unexpected error while instantiating. Possible problems (Did not register ${objectra.identifier!.name} class)`

			function createInstantiationBridge(transformator: Transformator): Transformator.InstantiationBridge<any, any> {
				return {
					value: objectra,
					instantiate: composeValueWithinContext,
					initialTransformator: transformator,
					keyPath: contextPropertyKeyPath,
				}
			};
		}
		
		const mainInstance = composeValueWithinContext(this);
		injectNewReferenceDefinitionsInto(mainInstance);
		return mainInstance;

		function createInstanceConstructor(transformator: Transformator<Constructor | Function>) {
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

		function getResolvedReferenceDefinition(target: Objectra): Objectra.Reference | null {
			const resolvedReferences = Array.from(resolvedObjectraReferenceDefinition);
			for (const [resolvedObjectra, resolvedInstance] of resolvedReferences) {
				if (resolvedObjectra.id === target.id) {
					return resolvedInstance;
				}
			}

			return null;
		}

		function injectNewReferenceDefinitionsInto(instanceToInject: any) {
			for (const [objectra, appearancePath] of awaitingDeclarationLocatedConsumer) {
				const resolution = getResolvedReferenceDefinition(objectra);
				if (resolution === null) {
					continue;
				}

				const fullRelativePath = [...appearancePath].slice(contextPropertyKeyPath.length);

				let drilledObject = instanceToInject;
				for (let i = 0; i < fullRelativePath.length; i++) {
					const key = fullRelativePath[i];
					if (!drilledObject) {
						break;
					}

					// Fill all entry unfilled references
					const transformator = Transformator.get(drilledObject.constructor);
					if (transformator.useSerializationSymbolIterator) {
						if (i + transformator.symbolIteratorEntryDepth === fullRelativePath.length) {
							const entries = iterableInstanceContents.get(drilledObject);
							if (!entries) {
								continue;
							}

							injectNewReferenceDefinitionsInto(entries);
						}
					}

					// Write the reference to an endpoint
					const keyIsLast = key === fullRelativePath.at(-1);
					if (keyIsLast) {
						if (!(drilledObject[key] instanceof Objectra.UnresolvedReferencePlaceholder)) {
							throw new Error('Invalid path sequence for definition injection. Possibly invalid pathKey applience in custom intantiator method');
						}

						drilledObject[key] = resolution;
						awaitingDeclarationLocatedConsumer.delete(objectra);
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
				model.t = objectra.identifier.name;
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

			if (objectra.isStructureDeclaration) {
				model.isd = objectra.isStructureDeclaration;
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

		const serializeValueWithinContext: Objectra.ValueSerialization = <T>(providedInstance: T) => {
			if (typeof providedInstance === 'undefined') {
				return new Objectra<Objectra.Content<T>>({ content: undefined });
			}

			if (providedInstance === null) {
				return new Objectra<Objectra.Content<T>>({ content: null as Objectra.Content<any> });
			}

			const instance = providedInstance as T & Objectra.Reference;
			
			if (typeof instance.constructor !== 'function') {
				// TODO Create custom error
				throw new Error(`Can not objectrafy an object inherited value without a constructor`);
			}

			const instanceIsReference = Objectra.isValueReference(instance);

			const instanceIsClassDeclaration = typeof instance === 'function';
			const instanceIsReferenceDefinition = instanceIsReference && repeatingReferences.has(instance) && !referableReferences.has(instance);
			const instanceShouldReinstantiateOnDefinition = instanceIsClassDeclaration ? false : instanceIsReferenceDefinition;

			if (!instanceShouldReinstantiateOnDefinition && repeatingReferences.has(instance) && referableReferences.has(instance)) {
				const id = referenceIdentifiers.get(instance);
				if (typeof id === 'undefined') {
					// TODO Create custom error
					throw new Error('Internal id not found')
				}

				return new Objectra({ id });
			}
			
			if (!instanceIsClassDeclaration) {
				// TODO Add id (bounce to compose method and handle them as full references)
				referableReferences.add(instance);
			}
			
			const instanceConstrucor = instance.constructor as Constructor;
			const instanceTransformator = Transformator.get(instanceConstrucor);
			const superTransformators = Transformator.getSuperTransformators(instanceConstrucor);

			const transformators: Transformator[] = [...superTransformators];
			if (instanceTransformator) {
				transformators.unshift(instanceTransformator);
			}

			if (instanceTransformator.serialize && !instanceTransformator.ignoreDefaultArgumentBehaviour && !instanceTransformator.instantiate) {
				throw new Error(`Transformator ${instanceTransformator.identifierToString()} must have an instantiator`);
			}

			const highestSerializationTransformator = Array.from(transformators).find(transformator => transformator.serialize);
			if (!highestSerializationTransformator) {
				throw new TransformatorMatchNotFoundError(instance.constructor);
			}

			const hoistingReferences = Array
				.from(referenceHoistingParentMap)
				.filter(([, parent]) => parent === instance)
				.map(([reference]) => reference);

			const objectraHoistings = hoistingReferences.map(serializeValueWithinContext);

			const id = instanceShouldReinstantiateOnDefinition ? referenceIdentifiers.get(instance) : void 0;
			
			if (typeof instance === 'function') {
				return new Objectra({
					identifier: instance,
					isStructureDeclaration: instanceIsClassDeclaration,
					id,
				});
			} 

			const objectraContent = highestSerializationTransformator.serialize!({
				instance: instance,
				objectrafy: serializeValueWithinContext,
				instanceTransformator,
			}) as Objectra.Content<T>;

			const objectra = new Objectra({
				identifier: instance.constructor,
				content: objectraContent,
				hoistingReferences: objectraHoistings.length ? objectraHoistings : void 0,
				id,
			});

			return objectra;
		}

		const result = serializeValueWithinContext(value);
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
					isStructureDeclaration: target.isd ?? false,
					hoistingReferences: hoistings,
					overload: target.o,
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
				isClassDeclaration: target.isd ?? false,
				hoistingReferences: target.h?.map(parseModel),
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

	private static readonly UnresolvedReferencePlaceholder = class UnresolvedReferencePlaceholder {};
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
		readonly isStructureDeclaration?: boolean;
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
		readonly repeatingReferences: Set<Objectra.Reference>;
	}

	export interface Model {
		readonly t?: string; // Class constructor name
		readonly n?: string; // Instance specification name
		readonly o?: number; // Overload for class / instance that have the same specification / constructor name
		readonly c?: ContentStructure<Model> | undefined; // Content
		readonly h?: Model[]; // Hoistings
		readonly id?: number;
		readonly isd?: boolean; // Is Class Declaration
	}

	export type Cluster = ObjectraCluster;
}

export * as errors from './errors';
export * as utils from './utils';
export * as transformators from './transformators';
export { Transformator } from './transformator';