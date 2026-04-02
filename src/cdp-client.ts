/**
 * CDP WebSocket Client
 * Manages the raw Chrome DevTools Protocol connection over WebSocket.
 */

import WebSocket from "ws";

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

  async connect(wsUrl: string): Promise<void> {
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
          console.error("Failed to parse CDP message");
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
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this.ws || !this.connected) {
      throw new Error(
        "Not connected to Chrome. Use connect_cdp tool first."
      );
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP request timed out: ${method}`));
      }, 30000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
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
    const url = `http://${host}:${port}/json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching targets`);
    return resp.json() as Promise<any[]>;
  }

  async getVersion(host: string, port: number): Promise<any> {
    const url = `http://${host}:${port}/json/version`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching version`);
    return resp.json();
  }
}
