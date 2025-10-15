import { validate } from "@mintlify/openapi-parser";
import axios, { isAxiosError } from "axios";
import dashify from "dashify";
import fs from "fs";
import { getFileId } from "../utils.js";
import { Endpoint } from "../types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  convertEndpointToCategorizedZod,
  convertStrToTitle,
  findNextIteration,
  getEndpointsFromOpenApi,
  loadEnv,
  getValFromNestedJson,
  generateCfSignature,
  getElicitationConfig,
  hasElicitationEnabled,
  getMissingRequiredFields,
  createElicitationRequest,
  applyFieldMappings,
  validateElicitationResponse,
} from "./helpers.js";

async function triggerElicitationFlow(
  inputArgs: Record<string, any>,
  endpoint: Endpoint,
  server: McpServer
): Promise<Record<string, any>> {
  console.log(`Elicitation flow triggered for endpoint: ${endpoint.title}`);
  
  if (!hasElicitationEnabled(endpoint)) {
    console.log(`Elicitation not enabled for endpoint: ${endpoint.title}`);
    return inputArgs;
  }
  
  const elicitationConfig = getElicitationConfig(endpoint);
  if (!elicitationConfig) {
    console.log(`No elicitation config found for endpoint: ${endpoint.title}`);
    return inputArgs;
  }
  
  const missingFields = getMissingRequiredFields(elicitationConfig, inputArgs);
  console.log(`Missing fields: ${JSON.stringify(missingFields)}`);
  
  if (missingFields.length === 0) {
    console.log(`No missing fields, proceeding without elicitation`);
    return inputArgs;
  }
  
  // Create elicitation request for missing fields
  const elicitationRequest = createElicitationRequest(
    endpoint.title || endpoint.path,
    missingFields,
    elicitationConfig
  );
  
  console.log(`Created elicitation request: ${JSON.stringify(elicitationRequest)}`);
  
  // Use MCP elicitation to collect missing information
  const elicitationResult = await server.server.elicitInput(elicitationRequest.params);
  console.log(`Elicitation result: ${JSON.stringify(elicitationResult)}`);
  if (elicitationResult?.action !== "accept" || !elicitationResult?.content) {
    console.log(`Elicitation cancelled or failed`);
    throw new Error(`Operation cancelled. Required information was not provided.`);
  }
  
  console.log(`Elicitation successful, received values: ${JSON.stringify(elicitationResult.content)}`);
  
  // Validate the elicitation response
  const validationResult = validateElicitationResponse(elicitationConfig, elicitationResult.content);

  if (!validationResult.valid) {
    console.log(`Validation failed: ${JSON.stringify(validationResult.errors)}`);
    throw new Error(`Validation errors: ${validationResult.errors.join(', ')}`);
  }
  
  // Apply field mappings and merge with original input args
  const mappedArgs = applyFieldMappings(elicitationConfig, elicitationResult.content, inputArgs);
  
  console.log(`Applied field mappings, final args: ${JSON.stringify(mappedArgs)}`);
  
  return mappedArgs;
}

export async function createToolsFromOpenApi(
  openApiPath: string,
  index: number,
  server: McpServer,
  existingTools: Set<string>
): Promise<void> {
  let openapi: string;
  try {
    openapi = fs.readFileSync(openApiPath, "utf8");
  } catch (error) {
    return; // Skip if no file
  }

  const { valid, errors, specification } = await validate(openapi);

  if (!valid || !specification || !specification.paths) {
    console.error("Invalid OpenAPI file or missing paths:", errors);
    return;
  }

  const endpoints = getEndpointsFromOpenApi(specification);
  const endpointId = String(getFileId(specification, index));
  const envVars = loadEnv(endpointId);

  endpoints.forEach((endpoint: Endpoint) => {
    const {
      url: urlSchema,
      method: methodSchema,
      paths: pathsSchema,
      queries: queriesSchema,
      body: bodySchema,
      headers: headersSchema,
      cookies: cookiesSchema,
    } = convertEndpointToCategorizedZod(endpointId, endpoint);
    const serverArgumentsSchemas = Object.assign(
      Object.assign(
        Object.assign(
          Object.assign(Object.assign({}, pathsSchema), queriesSchema),
          bodySchema
        ),
        headersSchema
      ),
      cookiesSchema
    );
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

    server.tool(
      dashify(endpoint.title),
      endpoint.description || endpoint.title,
      serverArgumentsSchemas,
      async (inputArgs: Record<string, any>) => {  
        try {
          // Apply elicitation flow if enabled
          inputArgs = await triggerElicitationFlow(inputArgs, endpoint, server);
        } catch (error) {
          console.log("Elicitation error:", error);
        }
        console.log("elicitation applied input args:", inputArgs);
        const inputParams: Record<string, any> = {};
        const inputHeaders: Record<string, any> = {};
        const inputCookies: Record<string, any> = {};
        let urlWithPathParams = urlSchema;
        let inputBody: any = undefined;

        if ("body" in inputArgs) {
          inputBody = inputArgs.body;
          delete inputArgs.body;
        }

        Object.entries(inputArgs).forEach(([key, value]) => {
          if (key in pathsSchema) {
            urlWithPathParams = urlWithPathParams.replace(`{${key}}`, value);
          } else if (key in queriesSchema) {
            inputParams[key] = value;
          } else if (key in headersSchema) {
            inputHeaders[key] = value;
          } else if (key in cookiesSchema) {
            inputCookies[key] = value;
          }
        });

        if (endpoint.request.security.length > 0) {
          const securityParams = endpoint.request?.security?.[0]?.parameters;
          if (securityParams?.header) {
            Object.entries(securityParams.header).forEach(([key, value]) => {
              let envKey = "";
              if (
                typeof value === "object" &&
                value !== null &&
                "type" in value
              ) {
                const v = value as { type: string; scheme?: string };
                if (v.type === "apiKey") {
                  envKey = `header.${key}.API_KEY`;
                } else if (v.type === "http") {
                  envKey = `header.${key}.HTTP.${v.scheme}`;
                  if (v.scheme === "bearer" && envKey in envVars) {
                    inputHeaders["Authorization"] = `Bearer ${envVars[envKey]}`;
                    return;
                  }
                }
                const envValue = getValFromNestedJson(envKey, envVars);
                if (envKey && envValue) {
                  inputHeaders[key] = envValue;
                }
              }
            });
            Object.entries(securityParams.header).forEach(([key]) => {
              const headerValue = envVars.header?.[key];
              if (headerValue) {
                inputHeaders[key] = headerValue;
              }
            });
          }
        }

        if (openApiPath.includes("PO") || openApiPath.includes("VRS")) {
          const clientId =
            typeof envVars.header?.["x-client-id"] === "string"
              ? envVars.header["x-client-id"]
              : "";
          const publicKey =
            typeof envVars.TWO_FA_PUBLIC_KEY === "string"
              ? envVars.TWO_FA_PUBLIC_KEY
              : "";
          inputHeaders["x-cf-signature"] = generateCfSignature(
            clientId,
            publicKey
          );
        }

        const requestConfig = {
          method: methodSchema,
          url: urlWithPathParams,
          params: inputParams,
          data: inputBody,
          headers: inputHeaders,
        };

        try {
          const response = await axios(requestConfig);

          // Stringify the response data
          let responseData = JSON.stringify(response.data, undefined, 2);
          responseData = responseData.replace(
            /("beneficiary_instrument_details"\s*:\s*)(\[[^\]]*\]|\{[^\}]*\})/gs,
            '$1"[MASKED]"'
          );

          return {
            content: [
              {
                type: "text",
                text: responseData,
              },
            ],
          };
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "config" in error &&
            typeof (error as any).config === "object" &&
            (error as any).config !== null &&
            "headers" in (error as any).config
          ) {
            const errConfig = (error as any).config;
            ["x-client-id", "x-client-secret", "Authorization"].forEach(
              (header) => {
                if (errConfig.headers && errConfig.headers[header]) {
                  errConfig.headers[header] = "[MASKED]";
                }
              }
            );
          }
          const errMsg = JSON.stringify(error, undefined, 2);
          const data = JSON.stringify(
            isAxiosError(error) && error.response ? error.response.data : {},
            undefined,
            2
          );
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: isAxiosError(error)
                  ? `receivedPayload: ${data}\n\n errorMessage: ${error.message}\n\n${errMsg}`
                  : `receivedPayload: ${data}\n\n errorMessage: ${errMsg}`,
              },
            ],
          };
        }
      }
    );
  });
}
