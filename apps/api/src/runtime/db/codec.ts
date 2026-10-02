import { type CodecOptions, RecordId, StringRecordId } from 'surrealdb';

interface ForeignRecordId {
  table: string | { name: string };
  id: string | number;
}

const isForeignRecordId = (value: object): value is ForeignRecordId => {
  const proto = Object.getPrototypeOf(value);

  return (
    proto !== null &&
    proto !== Object.prototype &&
    'table' in value &&
    'id' in value &&
    typeof (value as { equals?: unknown }).equals === 'function'
  );
};

const normalizeEncoded = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (value instanceof RecordId || value instanceof StringRecordId) {
    return value;
  }

  if (!isForeignRecordId(value)) {
    return value;
  }

  const table =
    typeof value.table === 'string' ? value.table : value.table.name;

  return new RecordId(table, value.id);
};

const normalizeDecoded = (value: unknown): unknown => {
  if (value instanceof RecordId) {
    return String(value.id);
  }

  return value;
};

export const codecOptions: CodecOptions = {
  useNativeDates: true,
  valueEncodeVisitor: normalizeEncoded,
  valueDecodeVisitor: normalizeDecoded,
};
