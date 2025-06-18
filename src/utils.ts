import axios, { AxiosResponse } from "axios";
import { OpenAPI } from "@mintlify/openapi-types";

// A recursive type representing nested objects or strings
export type NestedRecord = string | { [key: string]: NestedRecord };

export type SimpleRecord = Record<string, NestedRecord>;

/**
 * Initializes an object along a given path, creating nested objects if needed.
 */
export function initializeObject(
  obj: SimpleRecord,
  path: string[]
): SimpleRecord {
  let current: NestedRecord = obj;

  for (const key of path) {
    if (typeof current === "string") break;

    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }

    current = current[key];
  }

  return obj;
}

/**
 * Gets a unique file ID based on spec title and version.
 */
export function getFileId(
  spec: OpenAPI.Document,
  index: number
): string | number {
  const title = spec.info?.title;
  const version = spec.info?.version;

  return title && version ? `${title} - ${version}` : index;
}

/**
 * Throws an error if the Axios response indicates a failure.
 */
export function throwOnAxiosError(
  response: AxiosResponse,
  errMsg: string
): void {
  const contentType = response.headers["content-type"];
  const isJson = contentType?.includes("application/json");

  if (response.status !== 200) {
    const errorMsg =
      isJson && response.data?.error
        ? `${errMsg}: ${response.data.error}`
        : `${errMsg}: ${response.status} ${response.statusText || ""}`;

    throw new Error(errorMsg);
  }

  if (!response.data) {
    throw new Error(`${errMsg}: ${response.status} ${response.statusText}`);
  }
}

/**
 * Formats various types of errors into human-readable strings.
 */
export function formatErr(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.message) {
      return err.message;
    }

    if (err.response) {
      const error = err.response.data?.error;
      return error || `${err.response.status} ${err.response.statusText}`;
    }

    if (err.request) {
      return "No response received from server";
    }

    return "An unknown Axios error occurred";
  }

  if (err instanceof Error) {
    return err.message;
  }

  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return "Unknown error (unstringifiable)";
  }
}
