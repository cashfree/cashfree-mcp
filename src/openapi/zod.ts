import { Blob } from "node:buffer";
import { z, ZodTypeAny, ZodSchema } from "zod";
import {
  DataSchema,
  DataSchemaArray,
  IncrementalDataSchema,
  IncrementalDataSchemaArray,
} from "@mintlify/validation";
import { BinaryLike } from "node:crypto";

type SchemaInput = DataSchema | IncrementalDataSchema;
type InitType = Blob | ArrayBuffer | BinaryLike;

// WebFile polyfill (based on fetch-blob, MIT License)
class WebFile extends Blob {
  private _lastModified: number = 0;
  private _name: string = "";

  constructor(
    init: BlobPart[] | BlobPart,
    options: BlobPropertyBag & { lastModified?: number; name?: string } = {}
  ) {
    if (arguments.length < 2) {
      throw new TypeError(
        `Failed to construct 'File': 2 arguments required, but only ${arguments.length} present.`
      );
    }
    super(
      Array.isArray(init)
        ? init.map((part) => {
            if (
              part instanceof Blob ||
              part instanceof ArrayBuffer ||
              typeof part === "string"
            ) {
              return part as InitType;
            }
            throw new TypeError("Invalid type in init array");
          })
        : [init as InitType],
      options
    );

    const lastModified =
      options?.lastModified === undefined
        ? Date.now()
        : Number(options.lastModified);

    if (!Number.isNaN(lastModified)) {
      this._lastModified = lastModified;
    } else {
      throw new TypeError("Invalid lastModified value");
    }
    if (typeof options.name === "string") {
      this._name = options.name;
    }
  }

  get name(): string {
    return this._name;
  }

  get lastModified(): number {
    return this._lastModified;
  }

  get [Symbol.toStringTag](): string {
    return "File";
  }

  static [Symbol.hasInstance](object: unknown): boolean {
    return (
      !!object &&
      object instanceof Blob &&
      /^(File)$/.test(
        String(
          (object as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag]
        )
      )
    );
  }
}

const File =
  typeof global.File === "undefined"
    ? WebFile
    : (global.File as unknown as typeof WebFile);

// Zod schema helpers
const ANY = z.any();
const ANY_OPT = ANY.optional();
const BOOLEAN = z.boolean();
const BOOLEAN_OPT = BOOLEAN.optional();
const FILE = z.instanceof(File);
const FILE_OPT = FILE.optional();
const NULL = z.null();
const NULL_OPT = NULL.optional();
const STRING = z.string();

export function dataSchemaArrayToZod(
  schemas: DataSchemaArray | IncrementalDataSchemaArray
): ZodTypeAny {
  if (!Array.isArray(schemas) || schemas.length === 0) {
    throw new TypeError("schemas must be a non-empty array");
  }
  const firstSchema = dataSchemaToZod(schemas[0]);
  if (!schemas[1]) return firstSchema;

  const zodSchemas: ZodSchema[] = [firstSchema];
  for (const schema of schemas.slice(1)) {
    zodSchemas.push(dataSchemaToZod(schema));
  }
  return z
    .union(zodSchemas as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]])
    .array();
}

function getEnumSchema(
  enumList: (string | number)[],
  type: "string" | "number"
): ZodTypeAny {
  if (!Array.isArray(enumList) || enumList.length === 0) {
    throw new TypeError("enumList must be a non-empty array");
  }
  const zodSchema = z.enum(enumList.map(String) as [string, ...string[]]);
  return type === "string" ? zodSchema : zodSchema.transform(Number);
}

export function dataSchemaToZod(schema: SchemaInput): ZodTypeAny {
  if (
    !schema ||
    typeof schema !== "object" ||
    !("type" in schema) ||
    Object.keys(schema).length === 0
  ) {
    return schema && (schema as { required?: boolean }).required
      ? ANY
      : ANY_OPT;
  }

  switch (schema.type) {
    case "null":
      return schema.required ? NULL : NULL_OPT;

    case "boolean":
      return schema.required ? BOOLEAN : BOOLEAN_OPT;

    case "enum<string>": {
      const strEnumSchema = getEnumSchema(schema.enum, "string");
      return schema.required ? strEnumSchema : strEnumSchema.optional();
    }

    case "enum<number>":
    case "enum<integer>": {
      const numEnumSchema = getEnumSchema(schema.enum, "number");
      return schema.required ? numEnumSchema : numEnumSchema.optional();
    }

    case "file":
      return schema.required ? FILE : FILE_OPT;

    case "any":
      return schema.required ? ANY : ANY_OPT;

    case "string": {
      if (
        "enum" in schema &&
        Array.isArray(schema.enum) &&
        schema.enum.length > 0
      ) {
        const stringEnum = z.enum(schema.enum as [string, ...string[]]);
        return schema.required ? stringEnum : stringEnum.optional();
      }

      if (schema.format === "binary") {
        return schema.required ? FILE : FILE_OPT;
      }

      let stringSchema = STRING;
      if (typeof schema.minLength === "number") {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (typeof schema.maxLength === "number") {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (typeof schema.pattern === "string") {
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
      }

      return schema.required ? stringSchema : stringSchema.optional();
    }

    // Continue with other types like number, integer, date, object, array, etc.
    // You can add them similarly with validation conditions
  }

  return ANY;
}
