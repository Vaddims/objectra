import { Objectra } from '../src';

const number = 42;
const string = 'Hello world';
const boolean = true;

describe('test transformer behaviours between Objectras and javscript values', () => {
	describe('primitives', () => {
		test('undefined', () => {
			const undefinedObjectra = new Objectra();

			expect(undefinedObjectra).toStrictEqual(Objectra.from());
			expect(undefinedObjectra).toStrictEqual(Objectra.from(undefined));
			expect(undefinedObjectra.toValue()).toBe(undefined);
		});

		test('null', () => {
			const nullObjectra = new Objectra(undefined, null);

			expect(nullObjectra).toStrictEqual(Objectra.from(null));
			expect(nullObjectra.toValue()).toBe(null);
		});

		test('string', () => {
			const stringObjectra = new Objectra(String, string);

			expect(stringObjectra).toStrictEqual(Objectra.from(string));
			expect(stringObjectra.toValue()).toBe(string);
		});

		test('number', () => {
			const numberObjectra = new Objectra(Number, number);
			const NaNObjectra = new Objectra(Number, 'NaN');

			expect(numberObjectra).toStrictEqual(Objectra.from(number));
			expect(numberObjectra.toValue()).toBe(number);
			expect(NaNObjectra).toStrictEqual(Objectra.from(NaN));
			expect(NaNObjectra.toValue()).toBe(NaN);
		});

		test('boolean', () => {
			const booleanObjectra = new Objectra(Boolean, boolean);

			expect(booleanObjectra).toStrictEqual(Objectra.from(boolean));
			expect(booleanObjectra.toValue()).toBe(boolean);
		})

		test('symbol', () => {
			const emptySymbol = Symbol();
			const symbol = Symbol(string);
			const emptySymbolObjectra = new Objectra(Symbol);
			const symbolObjectra = new Objectra(Symbol, string);

			expect(emptySymbolObjectra).toStrictEqual(Objectra.from(emptySymbol));
			expect((emptySymbolObjectra.toValue() as symbol).description).toBe(emptySymbol.description);
			expect(symbolObjectra).toStrictEqual(Objectra.from(symbol));
			expect((symbolObjectra.toValue() as symbol).description).toBe(symbol.description);
		});

		test('bigint', () => {
			const bigint = BigInt(number);
			const bigintObjectra = new Objectra(BigInt, number.toString());

			expect(bigintObjectra).toStrictEqual(Objectra.from(bigint));
			expect(bigintObjectra.toValue()).toBe(bigint);
		});
	});

	describe('objects', () => {
		test('Object', () => {
			const object = { foo: string };
			const objectObjectra = new Objectra(Object, {});
			const nestedObjectObjectra = new Objectra(Object, { foo: new Objectra(String, string) });

			expect(objectObjectra).toStrictEqual(Objectra.from({}));
			expect(objectObjectra.toValue()).toStrictEqual({});
			expect(nestedObjectObjectra).toStrictEqual(Objectra.from(object));
			expect(nestedObjectObjectra.toValue()).toStrictEqual(object);
			expect(nestedObjectObjectra.toValue()).not.toBe(object);
		});

		test('Array', () => {
			const array = [string];
			const arrayObjectra = new Objectra(Array, []);
			const nestedArrayObjectra = new Objectra(Array, [new Objectra(String, string)]);

			expect(arrayObjectra).toStrictEqual(Objectra.from([]));
			expect(arrayObjectra.toValue()).toStrictEqual([]);
			expect(nestedArrayObjectra).toStrictEqual(Objectra.from(array));
			expect(nestedArrayObjectra.toValue()).toStrictEqual(array);
			expect(nestedArrayObjectra.toValue()).not.toBe(array);
		});

		test('Objectra', () => {
			const objectra = new Objectra(undefined, null);
			const nestedObjecta = new Objectra(Objectra, { content: new Objectra(undefined, null) });

			expect(nestedObjecta).toStrictEqual(Objectra.from(objectra));
			expect(nestedObjecta.toValue()).toStrictEqual(objectra);
			expect(nestedObjecta.toValue()).not.toBe(objectra);
		});

		test('Map', () => {
			const map = new Map([[string, number]]);
			const mapObjectra = new Objectra(Map, []);
			const nestedMapObjectra = new Objectra(Map, [
				new Objectra(Array, [new Objectra(String, string), new Objectra(Number, number)]),
			]);
			
			expect(mapObjectra).toStrictEqual(Objectra.from(new Map()));
			expect(mapObjectra.toValue()).toStrictEqual(new Map());
			expect(nestedMapObjectra).toStrictEqual(Objectra.from(map));
			expect(nestedMapObjectra.toValue()).toStrictEqual(map);
			expect(nestedMapObjectra.toValue()).not.toBe(map);
		});

		test('Set', () => {
			const set = new Set([string]);
			const setObjectra = new Objectra(Set, []);
			const nestedSetObjectra = new Objectra(Set, [new Objectra(String, string)]);

			expect(setObjectra).toStrictEqual(Objectra.from(new Set()));
			expect(setObjectra.toValue()).toStrictEqual(new Set());
			expect(nestedSetObjectra).toStrictEqual(Objectra.from(set));
			expect(nestedSetObjectra.toValue()).toStrictEqual(set);
			expect(nestedSetObjectra.toValue()).not.toBe(set);
		})
	});
});
