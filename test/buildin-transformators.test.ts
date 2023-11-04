import { Objectra } from '../src';

const number = 42;
const string = 'Hello world';
const boolean = true;

describe('test objectra serialization and instantiation', () => {
	describe('primitives', () => {
		test('undefined', () => {
			expect(Objectra.duplicate(undefined)).toBe(undefined);
		});

		test('null', () => {
			expect(Objectra.duplicate(null)).toBe(null);
		});

		test('string', () => {
			expect(Objectra.duplicate(string)).toBe(string);
		});

		test('number', () => {
			expect(Objectra.duplicate(number)).toBe(number);
			expect(Objectra.duplicate(NaN)).toBe(NaN);
		});

		test('boolean', () => {
			expect(Objectra.duplicate(boolean)).toBe(boolean);
		});

		test('symbol', () => {
			const symbol = Symbol('test');
			const symbolDuplicate = Objectra.duplicate(symbol);
			expect(typeof symbolDuplicate).toBe('symbol')
			expect(symbolDuplicate).not.toBe(symbol);
			expect(symbolDuplicate.description).toBe(symbol.description);
		});

		test('bigint', () => {
			const bigint = BigInt(number);
			expect(Objectra.duplicate(bigint)).toBe(bigint);
		});
	});

	describe('simple instances', () => {
		test('date', () => {
			const date = new Date();
			const dateDuplicate = Objectra.duplicate(date);
			expect(dateDuplicate).toStrictEqual(date);
			expect(dateDuplicate).not.toBe(date);
		});

		test('array', () => {
			const array = [number, string, boolean];
			const arrayDuplicate = Objectra.duplicate(array);
			expect(arrayDuplicate).toStrictEqual(array);
			expect(arrayDuplicate).not.toBe(array);
		});

		test('object', () => {
			const object = { number, string, boolean };
			const objectDuplciate = Objectra.from(object).compose();
			expect(objectDuplciate).toStrictEqual(object);
			expect(objectDuplciate).not.toBe(object);
		});

		test('map', () => {
			const map = new Map<string, unknown>([
				['number', number],
				['string', string],
				['boolean', boolean],
			]);

			const mapDuplicate = Objectra.duplicate(map);
			expect(mapDuplicate).toStrictEqual(map);
			expect(mapDuplicate).not.toBe(map);
		});

		test('set', () => {
			const set = new Set<unknown>([number, string, boolean]);
			const setDuplicate = Objectra.duplicate(set);
			expect(setDuplicate).toStrictEqual(set);
			expect(setDuplicate).not.toBe(set);
		});
	})

	describe('complex instances', () => {
		test('array', () => {
			const complexArray = [number, string, boolean, new Set([number, string, boolean])];
			const complexArrayDuplicate = Objectra.duplicate(complexArray);

			expect(complexArrayDuplicate).toStrictEqual(complexArray);
			expect(complexArrayDuplicate).not.toBe(complexArray);
		});

		test('object', () => {
			const complexObject = {
				number,
				string,
				boolean,
				object: { number, string, boolean },
				set: new Set([string]),
				map: new Map(),
			};

			const complexObjectDuplicate = Objectra.duplicate(complexObject);
			expect(complexObjectDuplicate).toStrictEqual(complexObject);
			expect(complexObjectDuplicate).not.toBe(complexObject);
		});

		test('map', () => {
			const complexMap = new Map<string, unknown>([
				['number', number],
				['string', string],
				['boolean', boolean],
				['array', [number, string, boolean]],
				['object', { number, string, boolean }],
				['set', new Set([number, string, boolean])],
			]);

			const complexMapDuplicate = Objectra.duplicate(complexMap);
			expect(complexMapDuplicate).toStrictEqual(complexMap);
			expect(complexMapDuplicate).not.toBe(complexMap);
		});

		test('set', () => {
			const complexSet = new Set<unknown>([number, string, boolean, new Set([number, string, boolean])]);
			const complexSetDuplicate = Objectra.duplicate(complexSet);

			expect(complexSetDuplicate).toStrictEqual(complexSet);
			expect(complexSetDuplicate).not.toBe(complexSet);
		});
	});
});
