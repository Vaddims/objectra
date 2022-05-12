import { TransformationBridge } from "./transformation-bridge";
import { Transformator } from "./transformator";
import { randomUUID } from 'crypto';
import util from 'util';

export type IndexableObject<T = unknown> = { [key: string]: T } & Object;

type ObjectraContentPrimitives = number | string | boolean | null | undefined;
export type ObjectraContent<T = Objectra> = ObjectraContentPrimitives | IndexableObject<T> | T[];

/** Serialized "Objectra like" object */
export interface SerializedObjectra {
	references?: SerializedObjectraContent;
	content?: SerializedObjectraContent;
	type?: string;
	id?: string;
}

export type SerializedObjectraContent = ObjectraContent<SerializedObjectra>;

export class Objectra {
	public id?: string;
	public type?: string;
	public version?: string;
	public references?: ObjectraContent;
	public readonly content?: ObjectraContent;

	constructor(type?: Function | string, content?: ObjectraContent) {
		if (typeof content !== 'undefined') {
			this.content = content;
		}

		if (typeof type !== 'undefined') {
			this.type = typeof type === 'function' ? type.name : type;
		}
	}

	/** Create a value that inherits its type */
	toValue(): unknown {
		const { content, type } = this;
		if (typeof type === 'undefined' && typeof content === 'undefined') {
			return undefined;
		}

		if (content === null) {
			return null;
		}

		if (typeof type === 'undefined') {
			throw new Error(`The Objectra type is unexpectedly undefined.`);
		}

		const { instantiate, instantiateManualy } = Transformator.get(type);
		if (instantiateManualy) {
			const value = instantiateManualy(content);
			return value;
		}

		if (!instantiate) {
			throw new Error(`${type} transformator must contain at least one parsing function. (\`construct\` or \`toValue\`)`);
		}

		if (typeof content !== 'object') {
			return instantiate(content);
		}

		if (content instanceof Objectra) {
			return content.toValue();
		}

		const { constructor } = content;
		const contentTransformator = Transformator.get(constructor);

		if (contentTransformator.instantiateManualy) {
			const value = contentTransformator.instantiateManualy(content);
			return instantiate(value);
		}

		throw new Error(
			`${constructor.name} transformator must contain a \`toValue\` function to parse the content value.`
		);
	}

	/** Create a serialized object */
	toSerialized(): SerializedObjectra {
		return JSON.parse(this.toSerializedJson());
	}

	/** Create a serialized stringified json object */
	toSerializedJson(minifest = true): string {
		return JSON.stringify(this, null, minifest ? '' : '\t');
	}

	/** Create an Objectra from a value */
	public static from(value: unknown, options?: {}): Objectra {
		type ReferenceType = symbol | IndexableObject | unknown[] | object;
		const touches = new Set<ReferenceType>();
		const referenceMap = new Map<ReferenceType, string>();

		function touch(target: unknown) {
			if (target instanceof Objectra) {
				throw new Error(`Objectra cannot be created from itself.`);
			}

			if ((typeof target !== 'object' && typeof target !== 'symbol') || target === null) {
				return;
			}

			if (touches.has(target)) {
				if (referenceMap.has(target)) {
					return;
				}

				referenceMap.set(target, randomUUID());
				return;
			}

			touches.add(target);

			if (typeof target === 'symbol') {
				return;
			}

			if (Array.isArray(target)) {
				target.forEach(touch);
				return;
			}

			if (target instanceof Object) {
				const object = target as IndexableObject;
				for (const key in object) {
					touch(object[key]);
				}
			}
		}

		function objectrafy(target: unknown, useOnlyId = true) {
			if (target instanceof Objectra) {
				throw new Error(`Passed value to Objectra.from is already an Objectra.`);
			}

			if (typeof target === 'undefined') {
				return new Objectra();
			}

			if (target === null) {
				return new Objectra(undefined, null);
			}

			const { constructor: targetConstructor } = target as Object;
			const { serialize, serializeManualy } = Transformator.get(targetConstructor);

			const referenceId = referenceMap.get(target as ReferenceType);
			if (referenceId && useOnlyId) {
				const objectra = new Objectra();
				objectra.id = referenceId;
				return objectra;
			}

			if (serializeManualy) {
				const transformationBridge = new TransformationBridge(target, objectrafy);
				const objectraContent = serializeManualy(transformationBridge);
				const objectra = new Objectra(targetConstructor, objectraContent);
				if (!useOnlyId) {
					objectra.id = referenceId;
				}
				return objectra;
			}

			if (!serialize) {
				throw new Error(`${targetConstructor.name} transformator must contain at least one serialization function. (\`serialize\` or \`serializeManualy\`)`);
			}

			const serializedValue = serialize(value);
			const objectra = Objectra.from(serializedValue);
			objectra.type = targetConstructor.name;
			if (!useOnlyId) {
				objectra.id = referenceId;
			}
			return objectra;
		}

		touch(value);
		const mainObjectra = objectrafy(value);

		if (referenceMap.size === 0) {
			return mainObjectra;
		}

		mainObjectra.references = [];
		for (const referenceEntry of referenceMap) {
			const [reference, id] = referenceEntry;
			const referenceObjectra = objectrafy(reference, false);
			referenceObjectra.id = id;
			mainObjectra.references.push(referenceObjectra);
		}

		return mainObjectra;
	}

	/** Create an Objectra from a serialized object */
	static fromSerialized<T extends SerializedObjectra>(value: T): Objectra {
		const { type, content } = value;
		if (typeof type === 'undefined' && typeof content === 'undefined') {
			return new Objectra();
		}

		if (content === null) {
			return new Objectra(undefined, null);
		}

		if (typeof type === 'undefined') {
			throw new Error(`The serialized Objectra type is unexpectedly undefined. The structure is corrupted`);
		}

		if (typeof content !== 'object') {
			return new Objectra(type, content);
		}

		if (Array.isArray(content)) {
			const objectras = content.map(Objectra.fromSerialized);
			return new Objectra(type, objectras);
		}

		const object = content as IndexableObject<SerializedObjectra>;
		const fields: ObjectraContent = {};

		for (const key in object) {
			const value = object[key];
			const objectraContent = Objectra.fromSerialized(value);
			fields[key] = objectraContent;
		}

		return new Objectra(type, fields);
	}

	/** Create an Objectra from a serialized stringified json object */
	static fromSerializedJson(value: string): unknown {
		const object = JSON.parse(value);
		return Objectra.from(object);
	}

	/** Create a value from a serialized object */
	static parse<T extends SerializedObjectra>(value: T): unknown {
		return Objectra.fromSerialized(value).toValue();
	}

	/** Create a serialized object from a value */
	static serialize(value: unknown): SerializedObjectra {
		return Objectra.from(value).toSerialized();
	}

	/** Create a serialized stringified json object from a value */
	static serializeToJson(value: unknown): string {
		return Objectra.from(value).toSerializedJson();
	}

	/** Create a duplicate value that saves the object inheritance, bu removes all object references */
	static duplicate(value: unknown): unknown {
		return Objectra.from(value).toValue();
	}
}