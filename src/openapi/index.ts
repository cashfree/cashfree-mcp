import { validate } from "@mintlify/openapi-parser";
import axios, { isAxiosError } from "axios";
import dashify from "dashify";
import fs from "node:fs";
import { getFileId } from "../utils.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  convertEndpointToCategorizedZod,
  convertStrToTitle,
  findNextIteration,
  getEndpointsFromOpenApi,
  loadEnv,
  getValFromNestedJson,
} from "./helpers.js";
interface Endpoint {
  url?: string;
  method: string;
  path: string;
  title?: string;
  description?: string;
  request: { [key: string]: any };
  servers: Array<{ url: string }>;
  operation: {
    summary?: string;
    description?: string;
    tags?: string[];
    "x-mcp"?: Record<string, any>;
    operationId?: string;
    deprecated?: boolean;
    security?: any[];
    parameters?: any[];
    requestBody?: any;
    responses?: any;
    [key: string]: any;
  };
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
    // No OpenAPI file found, skip
    return;
  }

  const { valid, errors, specification } = await validate(openapi);

  if (!valid || !specification) {
    console.error("Invalid OpenAPI file:", errors);
    return;
  }

  if (!specification.paths) {
    console.error("Specification paths are undefined.");
    return;
  }
  if (!specification.paths) {
    console.error("Specification paths are undefined.");
    return;
  }
  const endpoints: Endpoint[] = getEndpointsFromOpenApi({
    ...specification,
    paths: (specification.paths || {}) as {
      [path: string]: { [method: string]: any };
    },
  }).map((ep: any) => ({
    ...ep,
    servers: Array.isArray(ep.servers) ? ep.servers : [],
    request: ep.request ?? {}, // Ensure request is always defined
  }));
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

    const serverArgumentsSchemas = {
      ...pathsSchema,
      ...queriesSchema,
      ...bodySchema,
      ...headersSchema,
      ...cookiesSchema,
    };

    if (!endpoint.title) {
      endpoint.title = `${endpoint.method} ${convertStrToTitle(endpoint.path)}`;
    }

    if (existingTools.has(endpoint.title)) {
      const lastCount = findNextIteration(existingTools, endpoint.title);
      endpoint.title = `${endpoint.title}---${lastCount}`;
    }

    if (endpoint.title.length > 64) {
      endpoint.title = endpoint.title.slice(0, 64);
    }

    existingTools.add(endpoint.title);

    server.tool(
      dashify(endpoint.title),
      endpoint.description || endpoint.title,
      serverArgumentsSchemas,
      async (inputArgs: Record<string, any>) => {
        const inputParams: Record<string, any> = {};
        const inputHeaders: Record<string, any> = {};
        const inputCookies: Record<string, any> = {};
        let urlWithPathParams = urlSchema;
        let inputBody: any = undefined;

        if ("body" in inputArgs) {
          inputBody = inputArgs.body;
          delete inputArgs.body;
        }

        for (const [key, value] of Object.entries(inputArgs)) {
          if (key in pathsSchema) {
            urlWithPathParams = urlWithPathParams.replace(`{${key}}`, value);
          } else if (key in queriesSchema) {
            inputParams[key] = value;
          } else if (key in headersSchema) {
            inputHeaders[key] = value;
          } else if (key in cookiesSchema) {
            inputCookies[key] = value;
          }
        }

        const security = endpoint.request?.security?.[0]?.parameters;
        if (security?.header) {
          for (const [key, value] of Object.entries(security.header)) {
            let envKey = "";
            if (
              typeof value === "object" &&
              value !== null &&
              "type" in value
            ) {
              if ((value as { type: string }).type === "apiKey") {
                envKey = `header.${key}.API_KEY`;
              } else if ((value as { type: string }).type === "http") {
                envKey = `header.${key}.HTTP`;
              }
            }

            const envVal = getValFromNestedJson(envKey, envVars);
            if (envVal) {
              inputHeaders[key] = envVal;
            }
          }
        }

        const requestConfig = {
          method: methodSchema,
          url: urlWithPathParams,
          params: inputParams,
          data: inputBody,
          headers: inputHeaders,
          withCredentials: true,
        };
        try {
          const response = await axios(requestConfig);
          return response.data;
        } catch (error) {
          if (isAxiosError(error)) {
            return {
              error: true,
              message: error.response?.data || error.message,
            };
          }
          return {
            error: true,
            message: "Unknown error occurred",
          };
        }
      }
    );
  });
}
