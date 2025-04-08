
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectServer } from './connect.js';
import { initialize } from './initialize.js';
import { createToolsFromOpenApi } from './openapi/index.js';
import { createSearchTool } from './search.js';
import { isMcpEnabled } from './openapi/helpers.js';
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const server = initialize();
        const existingTools = new Set();
        yield createSearchTool(server);
        const openApiDir = path.join(fileURLToPath(import.meta.url), '../openapi');
        const openApiFilePaths = fs
            .readdirSync(openApiDir)
            .filter((path) => path.startsWith('openapi-') && path.endsWith('.json'))
            .filter((path) => isMcpEnabled(path));
        yield Promise.all(openApiFilePaths.map((openApiPath, index) => __awaiter(this, void 0, void 0, function* () {
            return yield createToolsFromOpenApi(path.join(openApiDir, openApiPath), index, server, existingTools);
        })));
        yield connectServer(server);
    });
}
main().catch((error) => {
    console.error('Fatal error in trying to initialize MCP server: ', error);
    process.exit(1);
});
