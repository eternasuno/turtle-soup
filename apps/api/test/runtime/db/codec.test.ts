import { expect, it } from '@effect/vitest';
import { RecordId, StringRecordId } from 'surrealdb';
import { codecOptions } from '../../../src/runtime/db/codec';

const encode = codecOptions.valueEncodeVisitor;
const decode = codecOptions.valueDecodeVisitor;

class ForeignRecord {
  readonly table = { name: 'user' };
  readonly id = 42;

  equals() {}
}

it('normalizes foreign record-like values to RecordId', () => {
  const encoded = encode?.(new ForeignRecord());

  expect(encoded).toBeInstanceOf(RecordId);
  expect(String(encoded)).toBe('user:42');
});

it('preserves native record ids', () => {
  const record = new RecordId('user', 42);
  const stringRecord = new StringRecordId('user:42');

  expect(encode?.(record)).toBe(record);
  expect(encode?.(stringRecord)).toBe(stringRecord);
});

it('decodes RecordId values and preserves other values', () => {
  const record = new RecordId('user', 42);
  const stringRecord = new StringRecordId('user:42');
  const value = { table: 'user', id: 42 };

  expect(decode?.(record)).toBe('42');
  expect(decode?.(stringRecord)).toBe(stringRecord);
  expect(decode?.(value)).toBe(value);
  expect(encode?.(value)).toBe(value);
  expect(encode?.('value')).toBe('value');
});
