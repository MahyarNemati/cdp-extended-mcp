/**
 * CDP WebSocket Client
 * Manages the raw Chrome DevTools Protocol connection over WebSocket.
 */

import WebSocket from "ws";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const DEFAULT_TIMEOUT = 30000;
const LONG_TIMEOUT = 120000; // For heap snapshots, profiling, etc.
const LONG_RUNNING_METHODS = new Set([
  "HeapProfiler.takeHeapSnapshot",
  "Profiler.stop",
  "Runtime.evaluate",
]);

interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface CDPEvent {
  method: string;
  params?: Record<string, unknown>;
}

type EventHandler = (params: Record<string, unknown>) => void;

export class CDPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason: Error) => void;
    }
  >();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private connected = false;

  /**
   * Validate that a URL points to a loopback address to prevent SSRF.
   */
  static validateLoopback(urlStr: string): void {
    try {
      const parsed = new URL(urlStr);
      if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
        throw new Error(
          `Security: Only loopback connections allowed (localhost/127.0.0.1). Got: ${parsed.hostname}`
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Security:")) throw e;
      throw new Error(`Invalid URL: ${urlStr}`);
    }
  }

  async connect(wsUrl: string): Promise<void> {
    CDPClient.validateLoopback(wsUrl);

    // Warn if connecting to browser endpoint instead of page
    if (wsUrl.includes("/devtools/browser/")) {
      throw new Error(
        "This appears to be a browser-level WebSocket URL (/devtools/browser/...). " +
        "Use a page-level URL instead (/devtools/page/...). " +
        "Run discover_targets to find available page targets."
      );
    }

    if (this.connected) {
      await this.disconnect();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timed out after 10s"));
      }, 10000);

      ws.on("open", () => {
        clearTimeout(connectTimeout);
        this.ws = ws;
        this.connected = true;
        resolve();
      });

      ws.on("error", (err: Error) => {
        clearTimeout(connectTimeout);
        reject(
          new Error(
            `WebSocket connection failed: ${err.message || "unknown error"}`
          )
        );
      });

      ws.on("message", (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // Malformed message — ignore
        }
      });

      ws.on("close", () => {
        this.connected = false;
        this.ws = null;
        for (const [, handler] of this.pending) {
          handler.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });
    });
  }

  private handleMessage(msg: CDPResponse | CDPEvent): void {
    if ("id" in msg && msg.id !== undefined) {
      const handler = this.pending.get(msg.id);
      if (handler) {
        this.pending.delete(msg.id);
        if (msg.error) {
          handler.reject(
            new Error(
              `CDP Error: ${msg.error.message} (code: ${msg.error.code})`
            )
          );
        } else {
          handler.resolve(msg.result || {});
        }
      }
    } else if ("method" in msg) {
      const handlers = this.eventHandlers.get(msg.method);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.params || {});
          } catch {
            // Don't let event handler errors crash the client
          }
        }
      }
    }
  }

  async send(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<Record<string, unknown>> {
    if (!this.ws || !this.connected) {
      throw new Error(
        "Not connected to Chrome. Use connect_cdp tool first."
      );
    }

    const id = ++this.messageId;
    const timeout = timeoutMs ?? (LONG_RUNNING_METHODS.has(method) ? LONG_TIMEOUT : DEFAULT_TIMEOUT);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out after ${timeout}ms: ${method}`));
      }, timeout);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.pending.clear();
      this.eventHandlers.clear();
    }
  }

  async getTargets(host: string, port: number): Promise<any[]> {
    CDPClient.validateLoopback(`http://${host}:${port}`);
    const url = `http://${host}:${port}/json`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching targets`);
    return resp.json() as Promise<any[]>;
  }

  async getVersion(host: string, port: number): Promise<any> {
    CDPClient.validateLoopback(`http://${host}:${port}`);
    const url = `http://${host}:${port}/json/version`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching version`);
    return resp.json();
  }
}
