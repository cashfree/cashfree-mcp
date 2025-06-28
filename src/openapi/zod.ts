// Use the global Blob if available, otherwise fallback to node:buffer
const BlobClass: typeof Blob =
  typeof Blob !== "undefined" ? Blob : require("node:buffer").Blob;

import { z, ZodTypeAny } from "zod";

// Util to throw if required param missing
function panic(error: Error): never {
  throw error;
}

const WebFile = class File extends BlobClass {
  _lastModified: number;
  _name: string;

  constructor(
    init: BlobPart[],
    name: string = panic(
      new TypeError("File constructor requires name argument")
    ),
    options: { lastModified?: number; type?: string } = {}
  ) {
    if (arguments.length < 2) {
      throw new TypeError(
        `Failed to construct 'File': 2 arguments required, but only ${arguments.length} present.`
      );
    }

    super(init, options);

    const lastModified =
      options.lastModified === undefined
        ? Date.now()
        : Number(options.lastModified);

    this._lastModified = !Number.isNaN(lastModified)
      ? lastModified
      : Date.now();
    this._name = String(name);
  }

  get name(): string {
    return this._name;
  }

  get lastModified(): number {
    return this._lastModified;
  }

  get [Symbol.toStringTag]() {
    return "File";
  }

  static [Symbol.hasInstance](object: unknown): boolean {
    return (
      !!object &&
      object instanceof BlobClass &&
      (object as any)[Symbol.toStringTag] === "File"
    );
  }
};

// Use native File if available, otherwise fallback to WebFile
const FileClass: any =
  typeof globalThis.File === "undefined" ? WebFile : globalThis.File;

// Zod constants
const ANY = z.any();
const ANY_OPT = ANY.optional();
const BOOLEAN = z.boolean();
const BOOLEAN_OPT = BOOLEAN.optional();
const DATE = z.coerce.date();
const DATE_OPT = DATE.optional();
const FILE = z.instanceof(FileClass);
const FILE_OPT = FILE.optional();
const NULL = z.null();
const NULL_OPT = NULL.optional();
const RECORD = z.record(z.any());
const RECORD_WITH_DEFAULT = RECORD.default({});
const RECORD_OPT = RECORD.optional();
const STRING = z.string();
const NUMBER = z.number();
const INTEGER = z.number().int();

// Helper to generate Zod enum schema
function getEnumSchema(
  enumList: string[] | number[],
  type: "string" | "number"
) {
  const zodSchema = z.enum(enumList.map(String) as [string, ...string[]]);
  return type === "string" ? zodSchema : zodSchema.transform(Number);
}

// Convert array of schemas to Zod union array
export function dataSchemaArrayToZod(schemas: any[]): ZodTypeAny {
  const zodSchemas = schemas.map((schema) => dataSchemaToZod(schema));
  if (zodSchemas.length === 0) {
    // fallback to any if no schemas provided
    return z.array(z.any());
  }
  return z
    .union([...zodSchemas] as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
    .array();
}

// Main function: Convert data schema to Zod schema
export function dataSchemaToZod(schema: any): ZodTypeAny {
  if (!schema || typeof schema !== "object" || !("type" in schema)) {
    return schema?.required ? ANY : ANY_OPT;
  }

  switch (schema.type) {
    case "null":
      return schema.required ? NULL : NULL_OPT;

    case "boolean":
      return schema.required ? BOOLEAN : BOOLEAN_OPT;

    case "enum<string>": {
      const strEnum = getEnumSchema(schema.enum, "string");
      return schema.required ? strEnum : strEnum.optional();
    }

    case "enum<number>":
    case "enum<integer>": {
      const numEnum = getEnumSchema(schema.enum, "number");
      return schema.required ? numEnum : numEnum.optional();
    }

    case "file":
      return schema.required ? FILE : FILE_OPT;

    case "any":
      return schema.required ? ANY : ANY_OPT;

    case "string": {
      if (Array.isArray(schema.enum)) {
        const enumSchema = z.enum(schema.enum as [string, ...string[]]);
        return schema.required ? enumSchema : enumSchema.optional();
      }

      if (schema.format === "binary") {
        return schema.required ? FILE : FILE_OPT;
      }

      let stringSchema = STRING;

      if (schema.minLength !== undefined) {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (schema.maxLength !== undefined) {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.pattern !== undefined) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }

      switch (schema.format) {
        case "email":
          stringSchema = stringSchema.email();
          break;
        case "uri":
        case "url":
          stringSchema = stringSchema.url();
          break;
        case "uuid":
          stringSchema = stringSchema.uuid();
          break;
        case "date-time":
          return schema.required ? DATE : DATE_OPT;
      }

      if ("default" in schema) {
        return schema.required
          ? stringSchema.default(schema.default)
          : stringSchema.optional().default(schema.default);
      }

      return schema.required ? stringSchema : stringSchema.optional();
    }

    case "number":
    case "integer": {
      if (Array.isArray(schema.enum)) {
        const numEnum = getEnumSchema(schema.enum, "number");
        return schema.required ? numEnum : numEnum.optional();
      }

      let numSchema = schema.type === "integer" ? INTEGER : NUMBER;

      if (schema.minimum !== undefined) {
        numSchema = numSchema.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        numSchema = numSchema.max(schema.maximum);
      }
      if (schema.exclusiveMinimum !== undefined) {
        numSchema = numSchema.gt(schema.exclusiveMinimum);
      }
      if (schema.exclusiveMaximum !== undefined) {
        numSchema = numSchema.lt(schema.exclusiveMaximum);
      }

      return schema.required ? numSchema : numSchema.optional();
    }

    case "array": {
      let itemSchema: ZodTypeAny;

      if (Array.isArray(schema.items)) {
        itemSchema = dataSchemaArrayToZod(schema.items);
      } else {
        itemSchema = dataSchemaToZod(schema.items);
      }

      let arraySchema = z.array(itemSchema);

      if (schema.minItems !== undefined) {
        arraySchema = arraySchema.min(schema.minItems);
      }
      if (schema.maxItems !== undefined) {
        arraySchema = arraySchema.max(schema.maxItems);
      }

      return schema.required ? arraySchema : arraySchema.optional();
    }

    case "object": {
      const shape: Record<string, ZodTypeAny> = {};
      const requiredSet = new Set<string>(schema.requiredProperties || []);

      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        const zodProp = Array.isArray(propSchema)
          ? dataSchemaArrayToZod(propSchema)
          : dataSchemaToZod(propSchema);
        shape[key] = requiredSet.has(key) ? zodProp : zodProp.optional();
      }

      const objSchema = z.object(shape);

      if (Object.keys(shape).length === 0) {
        return schema.required ? RECORD_WITH_DEFAULT : RECORD_OPT;
      }

      return schema.required ? objSchema : objSchema.optional();
    }

    default:
      return schema.required ? ANY : ANY_OPT;
  }
}
