export interface InitializationConfiguration {
  name: string;
  trieveApiKey: string;
  trieveDatasetId: string;
}

export interface SearchResult {
  title: string;
  content: string;
  link: string;
}

export interface Endpoint {
  url?: string;
  method: string;
  path: string;
  title?: string;
  description?: string;
  request: { [key: string]: any };
  servers?: Array<{ url: string }> | { [key: string]: any };
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
