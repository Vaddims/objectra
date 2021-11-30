type IndexableObject<T = unknown> = { [key: string]: T };

type ObjectraContentPrimitives = number | string | boolean | null;
export type ObjectraContent<T = Objectra> = ObjectraContentPrimitives | IndexableObject<T> | T[];
export type SerializedObjectraContent = ObjectraContent<SerializedObjectra>;

/** Serialized "Objectra like" object */
export interface SerializedObjectra {
	content?: SerializedObjectraContent;
	type?: string;
}

export interface TransformatorDeclaration {
	/** Instantiate target class from content */
	construct?: (content: any, constructor: Function) => unknown;

	/** Create a pure object from an instance of the target class */
	simplify?: (content: any) => IndexableObject | unknown[];

	/** Manually Objectrafy the content, and then instantiate the target class from it. */
	toValue?: (content: any) => unknown;

	/** Manually deep serialize the content */
	toContent?: (content: any) => ObjectraContent | undefined;
}

interface Transformator extends TransformatorDeclaration {
	construct?: (content: any) => unknown;
}

const transformators = new Map<string, Transformator>();

export class Objectra {
	public type?: string;
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

		const { construct, toValue } = Objectra.getTransformator(type);
		if (toValue) {
			const value = toValue(content);
			return value;
		}

		if (construct) {
			if (typeof content === 'object') {
				if (content instanceof Objectra) {
					return content.toValue();
				}

				const { constructor } = content;
				const contentTransformator = Objectra.getTransformator(constructor);

				if (contentTransformator.toValue) {
					const value = contentTransformator.toValue(content);
					return construct(value);
				}

				throw new Error(
					`${constructor.name} transformator must contain a \`toValue\` function to parse the content value.`
				);
			}

			return construct(content);
		}

		throw new Error(`${type} transformator must contain at least one parsing function. (\`construct\` or \`toValue\`)`);
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
	static from(value?: unknown): Objectra {
		if (typeof value === 'function' || typeof value === 'undefined') {
			return new Objectra();
		}

		if (value === null) {
			return new Objectra(undefined, null);
		}

		const { constructor } = value as Object;
		const { simplify, toContent } = Objectra.getTransformator(constructor);

		if (typeof toContent === 'function') {
			const content = toContent(value);
			return new Objectra(constructor, content);
		}

		if (typeof simplify === 'function') {
			const simplifiedValue = simplify(value);
			const objectra = Objectra.from(simplifiedValue);
			objectra.type = constructor.name;
			return objectra;
		}

		throw new Error(
			`${constructor.name} transformator must contain at least one serializing function. (\`simplify\` or \`toContent\`)`
		);
	}

	/** Create an Objectra from a serialized object */
	static fromSerialized<T extends SerializedObjectra>(value: T): Objectra {
		const { content, type } = value;
		if (typeof type === 'undefined' && typeof content === 'undefined') {
			return new Objectra();
		}

		if (content === null) {
			return new Objectra(undefined, null);
		}

		if (typeof type === 'undefined') {
			throw new Error(`The serialized Objectra type is unexpectedly undefined. The structure is corrupted`);
		}

		const TypedObjectra = Objectra.bind({}, type);

		if (typeof content === 'object') {
			if (Array.isArray(content)) {
				const objectras = content.map(Objectra.fromSerialized);
				return new TypedObjectra(objectras);
			}

			const object = content as IndexableObject<SerializedObjectra>;
			const fields: ObjectraContent = {};

			for (const key in object) {
				const value = object[key];
				const objectraContent = Objectra.fromSerialized(value);
				fields[key] = objectraContent;
			}

			return new TypedObjectra(fields);
		}

		return new TypedObjectra(content);
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

	static getTransformator(constructor: Function | string): Transformator {
		const constructorName = typeof constructor === 'function' ? constructor.name : constructor;
		const transformator = transformators.get(constructorName);

		if (transformator) {
			return transformator;
		}

		throw new Error(`Transformator for \`${constructorName}\` is not assigned to transformator map`);
	}

	static addTransformator(constructors: Function | Function[], transformatorDeclaration: TransformatorDeclaration) {
		const constructorArray = Array.isArray(constructors) ? constructors : [constructors];
		for (const constructor of constructorArray) {
			if (transformators.has(constructor.name)) {
				throw new Error(`Transformator for \`${constructor.name}\` already exists`);
			}
	
			const { construct, ...transformers } = transformatorDeclaration;
			const transformator: Transformator = { ...transformers };
	
			if (construct) {
				transformator.construct = (content: unknown) => construct(content, constructor);
			}
	
			transformators.set(constructor.name, transformator);
		}

		return Objectra;
	}

	static {
		Objectra.addTransformator([String, Boolean], {
			construct: (content) => content,
			toContent: (content: string | boolean) => content,
		});

		Objectra.addTransformator(Number, {
			construct: (content) => Number(content),
			toContent: (content: number) => (isNaN(content) ? content.toString() : content),
		});

		Objectra.addTransformator(Symbol, {
			construct: (content) => Symbol(content),
			toContent: (content: symbol) => content.description as string,
		});

		Objectra.addTransformator(BigInt, {
			construct: (content) => BigInt(content),
			toContent: (content: bigint) => content.toString(),
		});

		Objectra.addTransformator(Object, {
			toValue: (content: IndexableObject<Objectra>) => {
				const values: IndexableObject<unknown> = {};
				for (const key in content) {
					const objectra = content[key];
					values[key] = objectra.toValue();
				}

				return values;
			},
			toContent: (content: IndexableObject<unknown>) => {
				const fields: ObjectraContent = {};
				for (const key in content) {
					const value = content[key];
					if (typeof value === 'function') {
						continue;
					}

					fields[key] = Objectra.from(content[key]);
				}

				return fields;
			},
		});

		Objectra.addTransformator(Array, {
			toValue: (content: Objectra[]) => {
				const values: unknown[] = [];
				for (const objectra of content) {
					values.push(objectra.toValue());
				}

				return values;
			},
			toContent: (content: unknown[]) => {
				const elements: ObjectraContent = [];

				for (const element of content) {
					if (typeof element === 'function') {
						continue;
					}

					elements.push(Objectra.from(element));
				}

				return elements;
			},
		});

		Objectra.addTransformator(Objectra, {
			simplify: (content: IndexableObject<unknown>) => ({ ...content }),
			toValue: (content: IndexableObject<Objectra>) => {
				const { toValue } = Objectra.getTransformator(Object);

				if (toValue) {
					const { type, content: objectraContent } = toValue(content) as SerializedObjectra;
					return new Objectra(type as string, objectraContent as ObjectraContent);
				}

				throw new Error(`${Object.name} transformator must contain a \`toValue\` function to parse the Objectra.`);
			},
		});

		Objectra.addTransformator(Map, {
			construct: (content: [unknown, unknown][]) => new Map(content),
			simplify: (content: Map<unknown, unknown>) => Array.from(content),
		});

		Objectra.addTransformator(Set, {
			construct: (content: unknown[]) => new Set(content),
			simplify: (content: Set<unknown>) => Array.from(content),
		});
	}
}
