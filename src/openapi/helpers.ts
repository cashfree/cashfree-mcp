import { OpenApiToEndpointConverter } from "@mintlify/validation";
import { z } from "zod";
import { dataSchemaArrayToZod, dataSchemaToZod } from "./zod.js";
import { readConfig } from "../config.js";
import { 
  Endpoint, 
  ElicitationConfiguration,
} from "../types.js";
import {
  ElicitRequest,
  PrimitiveSchemaDefinition,
  StringSchema,
  NumberSchema
} from "@modelcontextprotocol/sdk/types.js";
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
      count = Number(val.replace(`${str}---`, ""));
    }
  });
  return count + 1;
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


export function getEndpointsFromOpenApi(specification: any): Endpoint[] {
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
        if (!isMcpEnabledEndpoint(resolvedPathItem)) continue;
        const rawEndpoint = OpenApiToEndpointConverter.convert(
          {
            ...specification,
            paths: { [path]: { [method]: resolvedPathItem } },
          } as any,
          path,
          method as any
        );
        
        // Convert to our Endpoint type and ensure x-mcp configuration is preserved
        const endpoint: Endpoint = {
          ...rawEndpoint,
          operation: {
            ...resolvedPathItem,
            "x-mcp": resolvedPathItem["x-mcp"]
          }
        };
        
        endpoints.push(endpoint);
      } catch (error: any) {
        console.error(
          `Error processing endpoint ${method.toUpperCase()} ${path}:`,
          error.message
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
function convertParameterSection(parameters: any, paramSection: any) {
  if (parameters) {
    Object.entries(parameters).forEach(([key, value]: any) => {
      paramSection[key] = dataSchemaArrayToZod(value.schema);
    });
  }
}

function convertParametersAndAddToRelevantParamGroups(
  parameters: any,
  paths: any,
  queries: any,
  headers: any,
  cookies: any
) {
  convertParameterSection(parameters?.path, paths);
  convertParameterSection(parameters?.query, queries);
  convertParameterSection(parameters?.header, headers);
  convertParameterSection(parameters?.cookie, cookies);
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

  const baseUrl =
    envVariables.base_url ||
    (Array.isArray(endpoint?.servers) ? endpoint.servers[0]?.url : undefined) ||
    "";

  const url = `${baseUrl}${endpoint.path}`;
  const method = endpoint.method;

  const paths: Record<string, any> = {};
  const queries: Record<string, any> = {};
  const headers: Record<string, any> = {};
  const cookies: Record<string, any> = {};
  let body: any | undefined = undefined;

  convertParametersAndAddToRelevantParamGroups(
    endpoint?.request?.parameters,
    paths,
    queries,
    headers,
    cookies
  );

  const securityParams = endpoint?.request?.security?.[0]?.parameters;
  if (securityParams) {
    convertSecurityParametersAndAddToRelevantParamGroups(
      securityParams,
      queries,
      headers,
      cookies,
      envVariables
    );
  }

  const jsonBodySchema = endpoint?.request?.body?.["application/json"];
  const bodySchema = jsonBodySchema?.schemaArray?.[0];

  if (bodySchema) {
    const zodBodySchema = dataSchemaToZod(bodySchema);
    body = { body: zodBodySchema };
  }

  return {
    url,
    method,
    paths,
    queries,
    body,
    headers,
    cookies,
  };
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
  const mcp = (endpointSpec as any)["x-mcp"];
  return mcp?.["enabled"] === true;
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

/**
 * Extract elicitation configuration from an endpoint's x-mcp section
 */
export function getElicitationConfig(endpoint: Endpoint): ElicitationConfiguration | null {
  // Try multiple locations for x-mcp configuration
  const mcpConfig = endpoint.operation?.["x-mcp"] || (endpoint as any)["x-mcp"];
  if (!mcpConfig || !mcpConfig.config?.elicitation) {
    return null;
  }
  return mcpConfig.config.elicitation;
}

/**
 * Check if an endpoint has elicitation enabled
 */
export function hasElicitationEnabled(endpoint: Endpoint): boolean {
  const config = getElicitationConfig(endpoint);
  return config !== null && config.enabled && Object.keys(config.fields || {}).length > 0;
}

/**
 * Identify missing required fields for elicitation
 */
export function getMissingRequiredFields(
  elicitationConfig: ElicitationConfiguration,
  providedArgs: Record<string, any>
): string[] {
  const missingFields: string[] = [];
  
  Object.entries(elicitationConfig.fields).forEach(([fieldName, fieldConfig]) => {
    
    if (fieldConfig.required) {
      // Use the mapping target to check if field is provided
      const targetPath = fieldConfig.mapping.target;
      
      // Also check if the field is provided directly by name
      const fieldProvided = hasValueAtPath(providedArgs, targetPath) || 
                           hasValueAtPath(providedArgs, fieldName) ||
                           (fieldName in providedArgs && providedArgs[fieldName] !== undefined && providedArgs[fieldName] !== '');
      
      if (!fieldProvided) {
        missingFields.push(fieldName);
      }
    } else {
      // For optional fields, check if they are provided
      const targetPath = fieldConfig.mapping.target;
      const fieldProvided = hasValueAtPath(providedArgs, targetPath) || 
                           hasValueAtPath(providedArgs, fieldName) ||
                           (fieldName in providedArgs && providedArgs[fieldName] !== undefined && providedArgs[fieldName] !== '');

      if (!fieldProvided) {
        missingFields.push(fieldName);
      }
    }
  });
  
  console.log("Elicitation config " + JSON.stringify(elicitationConfig));
  console.log("Provided args " + JSON.stringify(providedArgs));
  console.log("Missing fields " + JSON.stringify(missingFields));
  return missingFields;
}

/**
 * Identify missing and provided fields for elicitation confirmation flow
 */
export function getMissingAndProvidedFields(
  elicitationConfig: ElicitationConfiguration,
  providedArgs: Record<string, any>
): { missingFields: string[]; providedFields: Record<string, any> } {
  const missingFields: string[] = [];
  const providedFields: Record<string, any> = {};
  
  Object.entries(elicitationConfig.fields).forEach(([fieldName, fieldConfig]) => {
    const targetPath = fieldConfig.mapping.target;
    
    // Check if field is provided
    const fieldProvided = hasValueAtPath(providedArgs, targetPath) || 
                         hasValueAtPath(providedArgs, fieldName) ||
                         (fieldName in providedArgs && providedArgs[fieldName] !== undefined && providedArgs[fieldName] !== '');
    
    if (fieldProvided) {
      // Get the actual value that was provided
      const value = getValueAtPath(providedArgs, targetPath) || 
                   getValueAtPath(providedArgs, fieldName) || 
                   providedArgs[fieldName];
      providedFields[fieldName] = value;
    } else if (fieldConfig.required) {
      missingFields.push(fieldName);
    }
  });
  
  console.log("Missing fields: " + JSON.stringify(missingFields));
  console.log("Provided fields: " + JSON.stringify(providedFields));
  return { missingFields, providedFields };
}

/**
 * Check if a value exists at a given path in an object
 */
function hasValueAtPath(obj: any, path: string): boolean {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  
  return current !== null && current !== undefined && current !== '';
}

/**
 * Get value at a given path in an object
 */
function getValueAtPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * Create an elicitation request for missing fields
 */
export function createElicitationRequest(
  toolName: string,
  missingFieldNames: string[],
  elicitationConfig: ElicitationConfiguration,
  message?: string
): ElicitRequest {
  const properties: Record<string, PrimitiveSchemaDefinition> = {};
  const required: string[] = [];

  for (const fieldName of missingFieldNames) {
    const fieldConfig = elicitationConfig.fields[fieldName];
    if (fieldConfig) {
      properties[fieldName] = fieldConfig.schema;
      if (fieldConfig.required) {
        required.push(fieldName);
      }
    }
  }

  return {
    method: "elicitation/create",
    params: {
      message: message || `Please provide the required parameters for ${toolName}:`,
      requestedSchema: {
        type: "object",
        properties,
        ...(required.length > 0 && { required })
      }
    }
  };
}

/**
 * Create an elicitation request that shows confirmation for provided values and asks for missing fields
 */
export function createConfirmationAndElicitationRequest(
  toolName: string,
  missingFieldNames: string[],
  providedFields: Record<string, any>,
  elicitationConfig: ElicitationConfiguration
): ElicitRequest {
  const properties: Record<string, PrimitiveSchemaDefinition> = {};
  const required: string[] = [];
  
  // Create confirmation message with provided values
  let confirmationMessage = `${toolName}\n\n`;
  
  if (Object.keys(providedFields).length > 0) {
    confirmationMessage += "**Current Values:**\n";
    Object.entries(providedFields).forEach(([fieldName, value]) => {
      const fieldConfig = elicitationConfig.fields[fieldName];
      const displayName = fieldConfig?.schema?.title || fieldName;
      confirmationMessage += `• ${displayName}: ${value}\n`;
    });
    confirmationMessage += "\n";
  }
  
  if (missingFieldNames.length > 0) {
    confirmationMessage += "**Required Information:**\n";
    missingFieldNames.forEach(fieldName => {
      const fieldConfig = elicitationConfig.fields[fieldName];
      if (fieldConfig) {
        confirmationMessage += `• ${fieldConfig.schema?.title || fieldName}: ${fieldConfig.message || 'Please provide this field'}\n`;
      }
    });
    confirmationMessage += "\n";
  }
  
  confirmationMessage += "Please confirm the current values and provide any missing information. You can update any field if needed:";
  
  // Add all configurable fields (both provided and missing) to allow updates
  Object.entries(elicitationConfig.fields).forEach(([fieldName, fieldConfig]) => {
    // Create a copy of the schema and set default value for provided fields
    const schema = { ...fieldConfig.schema };
    if (providedFields[fieldName] !== undefined) {
      (schema as any).default = providedFields[fieldName];
    }
    
    properties[fieldName] = schema;
    
    // Only mark as required if it's missing and marked as required in config
    if (fieldConfig.required && missingFieldNames.includes(fieldName)) {
      required.push(fieldName);
    }
  });

  return {
    method: "elicitation/create",
    params: {
      message: confirmationMessage,
      requestedSchema: {
        type: "object",
        properties,
        ...(required.length > 0 && { required })
      }
    }
  };
}/**
 * Apply field mappings to elicitation response values
 */
export function applyFieldMappings(
  elicitationConfig: ElicitationConfiguration,
  elicitationResponse: Record<string, any>,
  originalArgs: Record<string, any>
): Record<string, any> {
  const mappedArgs = { ...originalArgs };
  
  Object.entries(elicitationResponse).forEach(([fieldName, value]) => {
    const fieldConfig = elicitationConfig.fields[fieldName];
    if (fieldConfig) {
      const mapping = fieldConfig.mapping;
      setValueAtPath(mappedArgs, mapping.target, value, mapping.transform);
    } else {
      // Check if any field in the config matches this field name
      const matchingConfigField = Object.entries(elicitationConfig.fields).find(
        ([configFieldName]) => configFieldName === fieldName || configFieldName.split('.').pop() === fieldName
      );
      
      if (matchingConfigField) {
        const [, configField] = matchingConfigField;
        if (configField && configField.mapping) {
          setValueAtPath(mappedArgs, configField.mapping.target, value, configField.mapping.transform);
        }
      } else {
        // If no mapping exists, use the field name directly
        mappedArgs[fieldName] = value;
      }
    }
  });
  
  return mappedArgs;
}

/**
 * Set a value at a given path in an object
 */
function setValueAtPath(obj: any, path: string, value: any, transformation?: string): void {
  const parts = path.split('.');
  let current = obj;
  
  // Navigate to the parent of the target
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || current[part] === null || current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }
  
  // Apply transformation if specified
  let transformedValue = value;
  if (transformation) {
    transformedValue = applyTransformation(value, transformation);
  }
  
  // Set the final value
  const finalPart = parts[parts.length - 1];
  current[finalPart] = transformedValue;
}

/**
 * Apply transformation to a value
 */
function applyTransformation(value: any, transformation: string): any {
  switch (transformation) {
    case 'number':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    case 'string':
      return String(value);
    case 'array':
      return Array.isArray(value) ? value : [value];
    default:
      return value;
  }
}

/**
 * Validate elicitation response against validation schema
 */
export function validateElicitationResponse(
  elicitationConfig: ElicitationConfiguration,
  response: Record<string, any>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  Object.entries(response).forEach(([fieldName, value]) => {
    const fieldConfig = elicitationConfig.fields[fieldName];
    if (fieldConfig && fieldConfig.schema) {
      const schema = fieldConfig.schema;
      
      // Simple validation based on schema type
      if (schema.type === 'string') {
        const stringSchema = schema as StringSchema & { pattern?: string; enum?: string[] };
        
        if (stringSchema.pattern && typeof value === 'string' && typeof stringSchema.pattern === 'string') {
          const regex = new RegExp(stringSchema.pattern);
          if (!regex.test(value)) {
            errors.push(`Field ${fieldName} does not match required pattern`);
          }
        }
        
        if (typeof value === 'string') {
          if (stringSchema.minLength && value.length < stringSchema.minLength) {
            errors.push(`Field ${fieldName} is too short (minimum ${stringSchema.minLength} characters)`);
          }
          if (stringSchema.maxLength && value.length > stringSchema.maxLength) {
            errors.push(`Field ${fieldName} is too long (maximum ${stringSchema.maxLength} characters)`);
          }
        }
        
        if (stringSchema.enum && Array.isArray(stringSchema.enum) && !stringSchema.enum.includes(value)) {
          errors.push(`Field ${fieldName} must be one of: ${stringSchema.enum.join(', ')}`);
        }
      }
      
      if (schema.type === 'number' || schema.type === 'integer') {
        const numberSchema = schema as NumberSchema;
        
        if (typeof value === 'number') {
          if (numberSchema.minimum !== undefined && value < numberSchema.minimum) {
            errors.push(`Field ${fieldName} is too small (minimum ${numberSchema.minimum})`);
          }
          if (numberSchema.maximum !== undefined && value > numberSchema.maximum) {
            errors.push(`Field ${fieldName} is too large (maximum ${numberSchema.maximum})`);
          }
        }
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}
