var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { validate } from '@mintlify/openapi-parser';
import axios, { isAxiosError } from 'axios';
import dashify from 'dashify';
import fs from 'node:fs';
import { getFileId } from '../utils.js';
import { convertEndpointToCategorizedZod, convertStrToTitle, findNextIteration, getEndpointsFromOpenApi, loadEnv, getValFromNestedJson, generateCfSignature, } from './helpers.js';
export function createToolsFromOpenApi(openApiPath, index, server, existingTools) {
    return __awaiter(this, void 0, void 0, function* () {
        let openapi;
        try {
            openapi = fs.readFileSync(openApiPath, 'utf8');
        }
        catch (error) {
            // No OpenAPI file found, skip
            return;
        }
        const { valid, errors, specification } = yield validate(openapi);
        if (!valid || !specification) {
            console.error('Invalid OpenAPI file:', errors);
            return;
        }
        const endpoints = getEndpointsFromOpenApi(specification);
        const endpointId = String(getFileId(specification, index));
        const envVars = loadEnv(endpointId);
        endpoints.forEach((endpoint) => {
            const { url: urlSchema, method: methodSchema, paths: pathsSchema, queries: queriesSchema, body: bodySchema, headers: headersSchema, cookies: cookiesSchema, } = convertEndpointToCategorizedZod(endpointId, endpoint);
            const serverArgumentsSchemas = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, pathsSchema), queriesSchema), bodySchema), headersSchema), cookiesSchema);
            if (!endpoint.title) {
                endpoint.title = `${endpoint.method} ${convertStrToTitle(endpoint.path)}`;
            }
            if (existingTools.has(endpoint.title)) {
                const lastCount = findNextIteration(existingTools, endpoint.title);
                endpoint.title = `${endpoint.title}---${lastCount}`;
            }
            if (endpoint.title.length > 64) {
                endpoint.title = endpoint.title.slice(0, -64);
            }
            existingTools.add(endpoint.title);
            server.tool(dashify(endpoint.title), endpoint.description || endpoint.title, serverArgumentsSchemas, (inputArgs) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const inputParams = {};
                const inputHeaders = {};
                const inputCookies = {};
                let urlWithPathParams = urlSchema;
                let inputBody = undefined;
                if ('body' in inputArgs) {
                    inputBody = inputArgs.body;
                    delete inputArgs.body;
                }
                Object.entries(inputArgs).forEach(([key, value]) => {
                    if (key in pathsSchema) {
                        urlWithPathParams = urlWithPathParams.replace(`{${key}}`, value);
                    }
                    else if (key in queriesSchema) {
                        inputParams[key] = value;
                    }
                    else if (key in headersSchema) {
                        inputHeaders[key] = value;
                    }
                    else if (key in cookiesSchema) {
                        inputCookies[key] = value;
                    }
                });
                if (endpoint.request.security.length > 0) {
                    const securityParams = (_a = endpoint.request.security[0]) === null || _a === void 0 ? void 0 : _a.parameters;
                    if (securityParams) {
                        Object.entries(securityParams.header).forEach(([key, value]) => {
                            let envKey = '';
                            if (value.type === 'apiKey') {
                                envKey = `header.${key}.API_KEY`;
                            }
                            else if (value.type === 'http') {
                                envKey = `header.${key}.HTTP.${value.scheme}`;
                                if (value.scheme === 'bearer' && envKey in envVars) {
                                    inputHeaders['Authorization'] = `Bearer ${envVars[envKey]}`;
                                    return;
                                }
                            }
                            const envValue = getValFromNestedJson(envKey, envVars);
                            if (envKey && envValue) {
                                inputHeaders[key] = envValue;
                            }
                        });
                        Object.entries(securityParams.header).forEach(([key, value]) => {
                            const headerValue = envVars.header?.[key];
                            if (headerValue) {
                                inputHeaders[key] = headerValue;
                            }
                        });
                    }
                }
                if (openApiPath.includes('PO') || openApiPath.includes('VRS')) {
                    inputHeaders['x-cf-signature'] = generateCfSignature(envVars.header?.["x-client-id"], envVars.TWO_FA_PUBLIC_KEY);
                }
                try {
                    const response = yield axios({
                        url: urlWithPathParams,
                        method: methodSchema,
                        params: inputParams,
                        data: inputBody,
                        headers: inputHeaders,
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(response.data, undefined, 2),
                            },
                        ],
                    };
                }
                catch (error) {
                    
                    if (error.config && error.config.headers) {
                        ['x-client-id', 'x-client-secret', 'Authorization'].forEach((header) => {
                            if (error.config.headers[header]) {
                                error.config.headers[header] = '[MASKED]';
                            }
                        });
                    }

                    const errMsg = JSON.stringify(error, undefined, 2);
                    const data = JSON.stringify(error.response ? error.response.data : {}, undefined, 2);
                    return {
                        isError: true,
                        content: [
                            {
                                type: 'text',
                                text: isAxiosError(error) ? `receivedPayload: ${data}\n\n errorMessage: ${error.message}\n\n${errMsg}` : `receivedPayload: ${data}\n\n errorMessage: ${errMsg}`,
                            },
                        ],
                    };
                }
            }));
        });
    });
}
