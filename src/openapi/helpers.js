import { OpenApiToEndpointConverter, } from '@mintlify/validation';
import dashify from 'dashify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { initializeObject } from '../utils.js';
import { dataSchemaArrayToZod, dataSchemaToZod } from './zod.js';
import { load } from 'js-yaml';
export function convertStrToTitle(str) {
    const spacedString = str.replace(/[-_]/g, ' ');
    const words = spacedString.split(/(?=[A-Z])|\s+/);
    const titleCasedWords = words.map((word) => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
    return titleCasedWords.join(' ');
}
export function findNextIteration(set, str) {
    let count = 1;
    set.forEach((val) => {
        if (val.startsWith(`${str}---`)) {
            count = Number(val.replace(`${str}---`, ''));
        }
    });
    return count + 1;
}
export function getMcpEnabledEndpointsFromOpenApiSpecs(specs) {
    var _a;
    const mcpEnabledEndpoints = [];
    for (const spec of specs) {
        const isMcpEnabledGloballyInSpec = ((_a = spec['x-mcp']) === null || _a === void 0 ? void 0 : _a.enabled) === true;
        const endpoints = getEndpointsFromOpenApi(spec);
        if (isMcpEnabledGloballyInSpec) {
            const notDisabledEndpoints = endpoints.filter((endpoint) => { var _a; return ((_a = endpoint.xMcp) === null || _a === void 0 ? void 0 : _a.enabled) !== false; });
            mcpEnabledEndpoints.push(...notDisabledEndpoints);
        }
        else {
            const enabledEndpoints = endpoints.filter((endpoint) => { var _a; return ((_a = endpoint.xMcp) === null || _a === void 0 ? void 0 : _a.enabled) === true; });
            mcpEnabledEndpoints.push(...enabledEndpoints);
        }
    }
    return mcpEnabledEndpoints;
}
export function convertEndpointToTool(endpoint) {
    var _a, _b;
    let name;
    if ((_a = endpoint.xMcp) === null || _a === void 0 ? void 0 : _a.name) {
        name = endpoint.xMcp.name;
    }
    else if (endpoint.title) {
        name = dashify(endpoint.title);
    }
    else {
        name = convertStrToTitle(endpoint.path);
    }
    let description;
    if ((_b = endpoint.xMcp) === null || _b === void 0 ? void 0 : _b.description) {
        description = endpoint.xMcp.description;
    }
    else if (endpoint.description) {
        description = endpoint.description;
    }
    else {
        description = `${endpoint.method} ${endpoint.path}`;
    }
    return {
        name,
        description,
    };
}
export function getMcpToolsAndEndpointsFromOpenApiSpecs(specs) {
    const endpoints = getMcpEnabledEndpointsFromOpenApiSpecs(specs);
    const toolsWithEndpoints = [];
    endpoints.forEach((endpoint) => {
        const tool = convertEndpointToTool(endpoint);
        toolsWithEndpoints.push({
            tool,
            endpoint,
        });
    });
    return toolsWithEndpoints;
}
// Helper function to resolve references in an OpenAPI specification
function resolveReferences(spec, refPath, cache = {}) {
    // Return from cache if already resolved
    if (cache[refPath]) {
      return cache[refPath];
    }
  
    if (!refPath.startsWith('#/')) {
      throw new Error(`External references not supported: ${refPath}`);
    }
  
    const pathParts = refPath.substring(2).split('/');
    let current = spec;
  
    for (const part of pathParts) {
      if (!current[part]) {
        throw new Error(`Reference not found: ${refPath}`);
      }
      current = current[part];
    }
  
    // Handle nested references
    if (current && current.$ref) {
      current = resolveReferences(spec, current.$ref, cache);
    }
  
    // Cache the resolved reference
    cache[refPath] = current;
    return current;
  }
  
  // Function to deeply resolve all references in an object
  function resolveAllReferences(obj, spec, cache = {}) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
  
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => resolveAllReferences(item, spec, cache));
    }
  
    // Handle $ref
    if (obj.$ref) {
      const resolved = resolveReferences(spec, obj.$ref, cache);
      return resolveAllReferences({...resolved}, spec, cache);
    }
  
    // Handle regular objects
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveAllReferences(value, spec, cache);
    }
    return result;
  }
  
export function getEndpointsFromOpenApi(specification) {
    const endpoints = [];
    const paths = specification.paths;
    const refCache = {};
    for (const path in paths) {
        const operations = paths[path];
        for (const method in operations) {
            if (method === 'parameters' || method === 'trace') {
                continue;
            }
            try {
                // Resolve any references in the path item before converting
                const resolvedPathItem = resolveAllReferences(operations[method], specification, refCache);
                const endpoint = OpenApiToEndpointConverter.convert(
                  {...specification, paths: {[path]: {[method]: resolvedPathItem}}}, 
                  path, 
                  method
                );
                
                endpoints.push(endpoint);
            } catch (error) {
                console.error(`Error processing endpoint ${method.toUpperCase()} ${path}:`, error.message);
            }
        }
    }
    return endpoints;
}
export function loadEnv(key) {
    var _a;
    let envVars = {};
    try {
        const envPath = path.join(fileURLToPath(import.meta.url), '../../..', '.env.json');
        if (fs.existsSync(envPath)) {
            envVars = JSON.parse(fs.readFileSync(envPath).toString());
            return (_a = envVars[key]) !== null && _a !== void 0 ? _a : {};
        }
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw error;
        }
        // if there's no keys added in env, the user will be prompted
        // for their auth info at runtime if necessary
        // (shouldn't happen either way)
    }
    return envVars;
}
function convertParameterSection(parameters, paramSection) {
    Object.entries(parameters).forEach(([key, value]) => {
        const schema = value.schema;
        paramSection[key] = dataSchemaArrayToZod(schema);
    });
}
function convertParametersAndAddToRelevantParamGroups(parameters, paths, queries, headers, cookies) {
    convertParameterSection(parameters.path, paths);
    convertParameterSection(parameters.query, queries);
    convertParameterSection(parameters.header, headers);
    convertParameterSection(parameters.cookie, cookies);
}
function convertSecurityParameterSection(securityParameters, securityParamSection, envVariables, location) {
    Object.entries(securityParameters).forEach(([key, value]) => {
        let envKeyList = [];
        let targetKey = '';
        switch (value.type) {
            case 'apiKey':
                envKeyList = [location, key];
                targetKey = 'API_KEY';
                break;
            case 'http':
                envKeyList = [location, key, 'HTTP'];
                targetKey = value.scheme;
                break;
            case 'oauth2':
            default:
                break;
        }
        const target = initializeObject(Object.assign({}, envVariables), envKeyList);
        if (envKeyList.length && !target[targetKey]) {
            securityParamSection[key] = z.string();
        }
    });
}
function convertSecurityParametersAndAddToRelevantParamGroups(securityParameters, queries, headers, cookies, envVariables) {
    convertSecurityParameterSection(securityParameters.query, queries, envVariables, 'query');
    convertSecurityParameterSection(securityParameters.header, headers, envVariables, 'header');
    convertSecurityParameterSection(securityParameters.cookie, cookies, envVariables, 'cookie');
}
export function convertEndpointToCategorizedZod(envKey, endpoint) {
    var _a, _b, _c;
    const envVariables = loadEnv(envKey);
    const url = `${envVariables.base_url || ((_b = (_a = endpoint.servers) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.url) || ''}${endpoint.path}`;
    const method = endpoint.method;
    const paths = {};
    const queries = {};
    const headers = {};
    const cookies = {};
    let body = undefined;
    convertParametersAndAddToRelevantParamGroups(endpoint.request.parameters, paths, queries, headers, cookies);
    if ((_c = endpoint.request.security[0]) === null || _c === void 0 ? void 0 : _c.parameters) {
        convertSecurityParametersAndAddToRelevantParamGroups(endpoint.request.security[0].parameters, queries, headers, cookies, envVariables);
    }
    const jsonBodySchema = endpoint.request.body['application/json'];
    const bodySchemaArray = jsonBodySchema === null || jsonBodySchema === void 0 ? void 0 : jsonBodySchema.schemaArray;
    const bodySchema = bodySchemaArray === null || bodySchemaArray === void 0 ? void 0 : bodySchemaArray[0];
    if (bodySchema) {
        const zodBodySchema = dataSchemaToZod(bodySchema);
        body = { body: zodBodySchema };
    }
    return { url, method, paths, queries, body, headers, cookies };
}

export function getValFromNestedJson(key, jsonObj) {
    if (!key) {
        return;
    }
    var keySplit = key.split(".");
    var keyValue = jsonObj;
    for (const subKey of keySplit) {
        if (keyValue && subKey in keyValue) {
            keyValue = keyValue[subKey];
        } else {
            return undefined;
        }

    }

    return keyValue;
}

export function isMcpEnabled(path) {
    let enabledProducts =  loadEnv('McpTools');
    const product = path.split('.json')[0].split('-')[1]; 
    return enabledProducts[product] === true;
}