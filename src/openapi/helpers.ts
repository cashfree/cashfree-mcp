import { z } from "zod";
import { dataSchemaArrayToZod, dataSchemaToZod } from "./zod.js";
import { readConfig } from "../config.js";
import crypto from "crypto";
import fs from "fs";

export type CategorizedZod = {
  url: string;
  method: string;
  paths: Record<string, z.ZodTypeAny>;
  queries: Record<string, z.ZodTypeAny>;
  headers: Record<string, z.ZodTypeAny>;
  cookies: Record<string, z.ZodTypeAny>;
  body?: { body: z.ZodTypeAny };
};

type RefCache = { [key: string]: any };

type Specification = {
  paths: {
    [path: string]: {
      [method: string]: any;
    };
  };
};

type Endpoint = {
  request: any;
  servers: any;
  path: string;
  method: string;
  operation: any;
  "x-mcp"?: {
    enabled: boolean;
  };
};

export type NestedRecord =
  | string
  | {
      [key: string]: NestedRecord;
    };

export type SimpleRecord = Record<string, { [x: string]: undefined }>;

export function convertStrToTitle(str: string): string {
  const spacedString = str.replace(/[-_]/g, " ");
  const words = spacedString.split(/(?=[A-Z])|\s+/);
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function findNextIteration(set: Set<string>, str: string): number {
  let count = 1;
  set.forEach((val) => {
    if (val.startsWith(`${str}---`)) {
      const suffix = val.replace(`${str}---`, "");
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num >= count) {
        count = num + 1;
      }
    }
  });
  return count;
}

function resolveReferences(
  spec: Record<string, any>,
  refPath: string,
  cache: Record<string, any> = {}
): any {
  if (cache[refPath]) return cache[refPath];
  if (!refPath.startsWith("#/"))
    throw new Error(`External references not supported: ${refPath}`);
  const pathParts = refPath.substring(2).split("/");
  let current: any = spec;
  for (const part of pathParts) {
    if (!current[part]) throw new Error(`Reference not found: ${refPath}`);
    current = current[part];
  }
  if (current && current.$ref) {
    current = resolveReferences(spec, current.$ref, cache);
  }
  cache[refPath] = current;
  return current;
}

function resolveAllReferences(
  obj: any,
  spec: Specification,
  cache: RefCache
): any {
  if (obj && obj.$ref) {
    const resolved = resolveReferences(spec, obj.$ref, cache);
    return resolveAllReferences({ ...resolved }, spec, cache);
  }
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  const result: { [key: string]: any } = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveAllReferences(value, spec, cache);
  }
  return result;
}

export function getEndpointsFromOpenApi(
  specification: Specification
): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const paths = specification.paths;
  const refCache: RefCache = {};

  for (const path in paths) {
    const operations = paths[path];
    for (const method in operations) {
      if (method === "parameters" || method === "trace") continue;
      try {
        const resolvedPathItem = resolveAllReferences(
          operations[method],
          specification,
          refCache
        );
        endpoints.push({
          path,
          method,
          operation: resolvedPathItem,
          servers: undefined,
          request: undefined,
        });
      } catch (error) {
        console.error(
          `Failed to resolve references for ${method} ${path}:`,
          error
        );
      }
    }
  }

  return endpoints;
}

export function loadEnv(key: string): SimpleRecord {
  try {
    const config: any = readConfig();
    return config[key] || {};
  } catch (error) {
    if (error instanceof SyntaxError) throw error;
    return {};
  }
}

// Zod schema conversion helpers
function convertParameterSection(
  parameters: { [s: string]: unknown } | ArrayLike<unknown>,
  paramSection: { [x: string]: z.ZodTypeAny }
) {
  Object.entries(parameters).forEach(([key, value]) => {
    if (typeof value === "object" && value !== null && "schema" in value) {
      paramSection[key] = dataSchemaArrayToZod(
        (value as { schema: any }).schema
      );
    }
  });
}

function convertParametersAndAddToRelevantParamGroups(
  parameters: {
    path: { [s: string]: unknown } | ArrayLike<unknown>;
    query: { [s: string]: unknown } | ArrayLike<unknown>;
    header: { [s: string]: unknown } | ArrayLike<unknown>;
    cookie: { [s: string]: unknown } | ArrayLike<unknown>;
  },
  paths: { [x: string]: z.ZodTypeAny },
  queries: { [x: string]: z.ZodTypeAny },
  headers: { [x: string]: z.ZodTypeAny },
  cookies: { [x: string]: z.ZodTypeAny }
) {
  convertParameterSection(parameters.path, paths);
  convertParameterSection(parameters.query, queries);
  convertParameterSection(parameters.header, headers);
  convertParameterSection(parameters.cookie, cookies);
}

function convertSecurityParameterSection(
  securityParameters: ArrayLike<unknown> | { [s: string]: unknown },
  securityParamSection: { [x: string]: z.ZodString },
  envVariables: { [x: string]: { [x: string]: undefined } },
  location: string
) {
  Object.entries(securityParameters).forEach(([key]) => {
    if (envVariables[location][key] === undefined) {
      securityParamSection[key] = z.string();
    }
  });
}

function convertSecurityParametersAndAddToRelevantParamGroups(
  securityParameters: {
    query: ArrayLike<unknown> | { [s: string]: unknown };
    header: ArrayLike<unknown> | { [s: string]: unknown };
    cookie: ArrayLike<unknown> | { [s: string]: unknown };
  },
  queries: { [x: string]: z.ZodString },
  headers: { [x: string]: z.ZodString },
  cookies: { [x: string]: z.ZodString },
  envVariables: SimpleRecord
) {
  convertSecurityParameterSection(
    securityParameters.query,
    queries,
    envVariables,
    "query"
  );
  convertSecurityParameterSection(
    securityParameters.header,
    headers,
    envVariables,
    "header"
  );
  convertSecurityParameterSection(
    securityParameters.cookie,
    cookies,
    envVariables,
    "cookie"
  );
}

export function convertEndpointToCategorizedZod(
  envKey: string,
  endpoint: Endpoint
): CategorizedZod {
  const envVariables = loadEnv(envKey);
  const url = `${envVariables.base_url || endpoint.servers?.[0]?.url || ""}${
    endpoint.path
  }`;
  const method = endpoint.method;
  const paths: Record<string, z.ZodTypeAny> = {};
  const queries: Record<string, z.ZodTypeAny> = {};
  const headers: Record<string, z.ZodTypeAny> = {};
  const cookies: Record<string, z.ZodTypeAny> = {};
  const securityQueries: Record<string, z.ZodString> = {};
  const securityHeaders: Record<string, z.ZodString> = {};
  const securityCookies: Record<string, z.ZodString> = {};
  let body: { body: z.ZodTypeAny } | undefined = undefined;

  convertParametersAndAddToRelevantParamGroups(
    endpoint.request.parameters,
    paths,
    queries,
    headers,
    cookies
  );

  if (endpoint.request.security?.[0]?.parameters) {
    convertSecurityParametersAndAddToRelevantParamGroups(
      endpoint.request.security[0].parameters,
      securityQueries,
      securityHeaders,
      securityCookies,
      envVariables
    );
    // Merge security parameters into main parameter groups
    Object.assign(queries, securityQueries);
    Object.assign(headers, securityHeaders);
    Object.assign(cookies, securityCookies);
  }

  const jsonBodySchema = endpoint.request.body?.["application/json"];
  const bodySchemaArray = jsonBodySchema?.schemaArray;
  const bodySchema = bodySchemaArray?.[0];
  if (bodySchema) {
    const zodBodySchema = dataSchemaToZod(bodySchema);
    body = { body: zodBodySchema };
  }

  return { url, method, paths, queries, body, headers, cookies };
}

export function getValFromNestedJson(key: string, jsonObj: SimpleRecord): any {
  if (!key || !jsonObj) return;
  return jsonObj[key];
}

export function isMcpEnabled(path: string): boolean {
  const product = path.split(".json")[0].split("-")[1];
  const tools = process.env.TOOLS
    ? process.env.TOOLS.toLowerCase().split(",")
    : [];
  switch (product) {
    case "PG":
      return tools.includes("pg");
    case "PO":
      return tools.includes("payouts");
    case "VRS":
      return tools.includes("secureid");
    default:
      return false;
  }
}

export function isMcpEnabledEndpoint(endpointSpec: Endpoint): boolean {
  return endpointSpec?.["x-mcp"]?.["enabled"] === true;
}

/**
 * Generate a signature by encrypting the client ID and current UNIX timestamp using RSA encryption.
 * @param {string} clientId - The client ID to be used in the signature.
 * @param {string} publicKey - The RSA public key for encryption.
 * @returns {string} - The generated signature.
 */
export function generateCfSignature(clientId: string, publicKey: string) {
  try {
    const timestamp = Math.floor(Date.now() / 1000); // Current UNIX timestamp
    const data = `${clientId}.${timestamp}`;
    const buffer = Buffer.from(data, "utf8");
    const encrypted = crypto.publicEncrypt(publicKey, buffer);
    return encrypted.toString("base64");
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error generating signature: ${error.message}`);
    } else {
      console.error("Error generating signature: Unknown error");
    }
  }
}

/**
 * Retrieve the public key from a given file path.
 * @param {string} path - The file path to the public key.
 * @returns {string} - The public key as a string.
 * @throws {Error} - If the file cannot be read.
 */
export function getPublicKeyFromPath(path: string): string | null {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (error) {
    console.warn(
      `Warning: Failed to read public key from path: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return null;
  }
}
