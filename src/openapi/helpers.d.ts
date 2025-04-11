import { OpenAPI } from '@mintlify/openapi-types';
import { HttpMethod } from '@mintlify/validation';
import { Endpoint } from '@mintlify/openapi-types';
import { DataSchemaArray } from '@mintlify/validation';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SimpleRecord } from './types';
import { ServerParams } from './types';

type ToolWithEndpoint = {
    tool: Omit<Tool, 'inputSchema'>;
    endpoint: Endpoint<DataSchemaArray>;
};

export declare function convertStrToTitle(str: string): string;
export declare function findNextIteration(set: Set<string>, str: string): number;
export declare function getEndpointsFromOpenApi(specification: any): Endpoint[];
export declare function loadEnv(key: string): SimpleRecord;
export declare type CategorizedZod = {
    url: string;
    method: string;
    paths: ServerParams;
    queries: ServerParams;
    headers: ServerParams;
    cookies: ServerParams;
};
export declare function convertEndpointToCategorizedZod(envKey: string, endpoint: Endpoint): CategorizedZod;
export declare function getValFromNestedJson(key: string, jsonObj: SimpleRecord): any;
export declare function isMcpEnabled(path: string): boolean;
