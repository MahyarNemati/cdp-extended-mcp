/**
 * Fetch Domain - Request Interception & Modification
 *
 * Intercept HTTP requests/responses mid-flight to:
 * - Mock API responses
 * - Block requests (ads, tracking)
 * - Modify headers (auth tokens, CORS)
 * - Simulate errors (500s, timeouts)
 * - Rewrite URLs
 */

import type { CDPClient } from "../cdp-client.js";

export interface InterceptRule {
  urlPattern: string;
  resourceType?: string;
  requestStage?: "Request" | "Response";
}

export interface PausedRequest {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
  };
  frameId: string;
  resourceType: string;
  responseStatusCode?: number;
  responseHeaders?: Array<{ name: string; value: string }>;
}

export class FetchDomain {
  private client: CDPClient;
  private pausedRequests = new Map<string, PausedRequest>();
  private enabled = false;

  constructor(client: CDPClient) {
    this.client = client;
  }

  async enable(
    patterns?: InterceptRule[],
    handleAuthRequests?: boolean
  ): Promise<string> {
    const params: Record<string, unknown> = {};
    if (patterns) {
      params.patterns = patterns.map((p) => ({
        urlPattern: p.urlPattern,
        resourceType: p.resourceType,
        requestStage: p.requestStage || "Request",
      }));
    }
    if (handleAuthRequests !== undefined) {
      params.handleAuthRequests = handleAuthRequests;
    }

    await this.client.send("Fetch.enable", params);
    this.enabled = true;

    // Listen for paused requests
    this.client.on("Fetch.requestPaused", (params) => {
      const req = params as unknown as PausedRequest;
      this.pausedRequests.set(req.requestId, req);
    });

    return `Fetch interception enabled${patterns ? ` with ${patterns.length} pattern(s)` : " for all requests"}`;
  }

  async disable(): Promise<string> {
    await this.client.send("Fetch.disable");
    this.enabled = false;
    this.pausedRequests.clear();
    return "Fetch interception disabled";
  }

  listPausedRequests(): PausedRequest[] {
    return Array.from(this.pausedRequests.values());
  }

  async continueRequest(
    requestId: string,
    overrides?: {
      url?: string;
      method?: string;
      postData?: string;
      headers?: Array<{ name: string; value: string }>;
    }
  ): Promise<string> {
    const params: Record<string, unknown> = { requestId };
    if (overrides?.url) params.url = overrides.url;
    if (overrides?.method) params.method = overrides.method;
    if (overrides?.postData) params.postData = btoa(overrides.postData);
    if (overrides?.headers) params.headers = overrides.headers;

    await this.client.send("Fetch.continueRequest", params);
    this.pausedRequests.delete(requestId);
    return `Request ${requestId} continued${overrides ? " with modifications" : ""}`;
  }

  async fulfillRequest(
    requestId: string,
    responseCode: number,
    body: string,
    headers?: Array<{ name: string; value: string }>
  ): Promise<string> {
    const params: Record<string, unknown> = {
      requestId,
      responseCode,
      body: btoa(body),
    };
    if (headers) params.responseHeaders = headers;

    await this.client.send("Fetch.fulfillRequest", params);
    this.pausedRequests.delete(requestId);
    return `Request ${requestId} fulfilled with status ${responseCode}`;
  }

  async failRequest(
    requestId: string,
    errorReason: string
  ): Promise<string> {
    await this.client.send("Fetch.failRequest", {
      requestId,
      errorReason,
    });
    this.pausedRequests.delete(requestId);
    return `Request ${requestId} failed with reason: ${errorReason}`;
  }

  async getResponseBody(
    requestId: string
  ): Promise<{ body: string; base64Encoded: boolean }> {
    const result = await this.client.send("Fetch.getResponseBody", {
      requestId,
    });
    return {
      body: result.base64Encoded ? atob(result.body as string) : (result.body as string),
      base64Encoded: result.base64Encoded as boolean,
    };
  }

  async continueWithAuth(
    requestId: string,
    response: "Default" | "CancelAuth" | "ProvideCredentials",
    username?: string,
    password?: string
  ): Promise<string> {
    const authChallengeResponse: Record<string, unknown> = { response };
    if (username) authChallengeResponse.username = username;
    if (password) authChallengeResponse.password = password;

    await this.client.send("Fetch.continueWithAuth", {
      requestId,
      authChallengeResponse,
    });
    this.pausedRequests.delete(requestId);
    return `Auth challenge responded with: ${response}`;
  }

  async continueResponse(
    requestId: string,
    overrides?: {
      responseCode?: number;
      responsePhrase?: string;
      responseHeaders?: Array<{ name: string; value: string }>;
    }
  ): Promise<string> {
    const params: Record<string, unknown> = { requestId };
    if (overrides?.responseCode) params.responseCode = overrides.responseCode;
    if (overrides?.responsePhrase) params.responsePhrase = overrides.responsePhrase;
    if (overrides?.responseHeaders) params.responseHeaders = overrides.responseHeaders;

    await this.client.send("Fetch.continueResponse", params);
    this.pausedRequests.delete(requestId);
    return `Response ${requestId} continued${overrides ? " with modifications" : ""}`;
  }
}
