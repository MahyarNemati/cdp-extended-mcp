/**
 * Performance Domain - Metrics, Profiling, and Core Web Vitals
 *
 * - Collect runtime performance metrics
 * - CPU profiling (start/stop/get profile)
 * - Heap snapshots
 * - Core Web Vitals via JS evaluation
 */

import type { CDPClient } from "../cdp-client.js";

export interface PerformanceMetric {
  name: string;
  value: number;
}

export interface CPUProfile {
  nodes: Array<{
    id: number;
    callFrame: {
      functionName: string;
      scriptId: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    };
    hitCount: number;
    children?: number[];
  }>;
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export class PerformanceDomain {
  private client: CDPClient;
  private enabled = false;
  private profiling = false;

  constructor(client: CDPClient) {
    this.client = client;
  }

  async enable(): Promise<string> {
    await this.client.send("Performance.enable", {
      timeDomain: "timeTicks",
    });
    this.enabled = true;
    return "Performance monitoring enabled";
  }

  async disable(): Promise<string> {
    await this.client.send("Performance.disable");
    this.enabled = false;
    return "Performance monitoring disabled";
  }

  async getMetrics(): Promise<PerformanceMetric[]> {
    if (!this.enabled) await this.enable();
    const result = await this.client.send("Performance.getMetrics");
    return (result.metrics as PerformanceMetric[]) || [];
  }

  async getFormattedMetrics(): Promise<string> {
    const metrics = await this.getMetrics();

    const important = [
      "Timestamp",
      "Documents",
      "Frames",
      "JSEventListeners",
      "Nodes",
      "LayoutCount",
      "RecalcStyleCount",
      "LayoutDuration",
      "RecalcStyleDuration",
      "ScriptDuration",
      "TaskDuration",
      "JSHeapUsedSize",
      "JSHeapTotalSize",
    ];

    const lines: string[] = ["## Performance Metrics\n"];

    for (const name of important) {
      const metric = metrics.find((m) => m.name === name);
      if (metric) {
        const value = metric.value;
        let formatted: string;

        if (name.includes("Duration")) {
          formatted = `${(value * 1000).toFixed(2)}ms`;
        } else if (name.includes("HeapUsedSize") || name.includes("HeapTotalSize")) {
          formatted = `${(value / 1024 / 1024).toFixed(2)}MB`;
        } else if (name === "Timestamp") {
          formatted = new Date(value * 1000).toISOString();
        } else {
          formatted = value.toLocaleString();
        }

        lines.push(`- **${name}**: ${formatted}`);
      }
    }

    return lines.join("\n");
  }

  async startCPUProfile(): Promise<string> {
    await this.client.send("Profiler.enable");
    await this.client.send("Profiler.start");
    this.profiling = true;
    return "CPU profiling started. Perform the actions you want to profile, then stop.";
  }

  async stopCPUProfile(): Promise<{ summary: string; profile: CPUProfile }> {
    if (!this.profiling) {
      throw new Error("No profiling in progress. Call startCPUProfile first.");
    }

    const result = await this.client.send("Profiler.stop");
    this.profiling = false;
    await this.client.send("Profiler.disable");

    const profile = result.profile as CPUProfile;

    const hotFunctions = profile.nodes
      .filter((n) => n.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 20);

    const totalSamples = profile.samples?.length || 1;
    const duration =
      (profile.endTime - profile.startTime) / 1000000;

    const lines = [
      `## CPU Profile Summary`,
      `- **Duration**: ${duration.toFixed(2)}s`,
      `- **Total samples**: ${totalSamples}`,
      `- **Unique functions**: ${profile.nodes.length}`,
      "",
      "### Top Functions by CPU Time",
      "",
    ];

    for (const fn of hotFunctions) {
      const pct = ((fn.hitCount / totalSamples) * 100).toFixed(1);
      const name = fn.callFrame.functionName || "(anonymous)";
      const loc = fn.callFrame.url
        ? `${fn.callFrame.url}:${fn.callFrame.lineNumber}`
        : "(native)";
      lines.push(
        `- **${name}** - ${fn.hitCount} samples (${pct}%) - ${loc}`
      );
    }

    return { summary: lines.join("\n"), profile };
  }

  async takeHeapSnapshot(): Promise<string> {
    await this.client.send("HeapProfiler.enable");

    const chunks: string[] = [];
    const chunkHandler = (params: Record<string, unknown>) => {
      chunks.push(params.chunk as string);
    };

    this.client.on("HeapProfiler.addHeapSnapshotChunk", chunkHandler);

    try {
      await this.client.send("HeapProfiler.takeHeapSnapshot", {
        reportProgress: false,
        treatGlobalObjectsAsRoots: true,
      });
    } finally {
      this.client.off("HeapProfiler.addHeapSnapshotChunk", chunkHandler);
      await this.client.send("HeapProfiler.disable");
    }

    const snapshotStr = chunks.join("");
    let nodeCount: string | number = "unknown";
    let edgeCount: string | number = "unknown";

    try {
      const parsed = JSON.parse(snapshotStr);
      nodeCount = parsed.snapshot?.node_count ?? "unknown";
      edgeCount = parsed.snapshot?.edge_count ?? "unknown";
    } catch {
      // Snapshot too large or malformed - report size only
    }

    return [
      "## Heap Snapshot Summary",
      `- **Nodes**: ${nodeCount}`,
      `- **Edges**: ${edgeCount}`,
      `- **Snapshot size**: ${(snapshotStr.length / 1024 / 1024).toFixed(2)}MB`,
    ].join("\n");
  }

  async getCoreWebVitals(): Promise<string> {
    const script = `
      new Promise((resolve) => {
        const vitals = {};
        try {
          const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) vitals.lcp = entries[entries.length - 1].startTime;
          });
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

          let clsValue = 0;
          const clsObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) clsValue += entry.value;
            }
            vitals.cls = clsValue;
          });
          clsObserver.observe({ type: 'layout-shift', buffered: true });

          const paintEntries = performance.getEntriesByType('paint');
          const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
          if (fcp) vitals.fcp = fcp.startTime;

          const navEntries = performance.getEntriesByType('navigation');
          if (navEntries.length > 0) {
            vitals.ttfb = navEntries[0].responseStart;
            vitals.domContentLoaded = navEntries[0].domContentLoadedEventEnd;
            vitals.loadComplete = navEntries[0].loadEventEnd;
          }

          if (performance.memory) {
            vitals.jsHeapUsed = performance.memory.usedJSHeapSize;
            vitals.jsHeapTotal = performance.memory.totalJSHeapSize;
          }

          setTimeout(() => {
            lcpObserver.disconnect();
            clsObserver.disconnect();
            resolve(JSON.stringify(vitals));
          }, 200);
        } catch(e) {
          resolve(JSON.stringify(vitals));
        }
      })
    `;

    const result = await this.client.send("Runtime.evaluate", {
      expression: script,
      awaitPromise: true,
      returnByValue: true,
    });

    const resultObj = result.result as Record<string, unknown> | undefined;
    let vitals: Record<string, number> = {};
    try {
      vitals = JSON.parse((resultObj?.value as string) || "{}");
    } catch {
      return "Failed to collect Core Web Vitals. Page may not support the Performance Observer API.";
    }

    const lines = ["## Core Web Vitals\n"];

    if (vitals.lcp !== undefined)
      lines.push(
        `- **LCP** (Largest Contentful Paint): ${vitals.lcp.toFixed(0)}ms ${vitals.lcp <= 2500 ? "GOOD" : vitals.lcp <= 4000 ? "NEEDS IMPROVEMENT" : "POOR"}`
      );
    if (vitals.cls !== undefined)
      lines.push(
        `- **CLS** (Cumulative Layout Shift): ${vitals.cls.toFixed(4)} ${vitals.cls <= 0.1 ? "GOOD" : vitals.cls <= 0.25 ? "NEEDS IMPROVEMENT" : "POOR"}`
      );
    if (vitals.fcp !== undefined)
      lines.push(
        `- **FCP** (First Contentful Paint): ${vitals.fcp.toFixed(0)}ms ${vitals.fcp <= 1800 ? "GOOD" : vitals.fcp <= 3000 ? "NEEDS IMPROVEMENT" : "POOR"}`
      );
    if (vitals.ttfb !== undefined)
      lines.push(
        `- **TTFB** (Time to First Byte): ${vitals.ttfb.toFixed(0)}ms ${vitals.ttfb <= 800 ? "GOOD" : vitals.ttfb <= 1800 ? "NEEDS IMPROVEMENT" : "POOR"}`
      );
    if (vitals.domContentLoaded !== undefined)
      lines.push(
        `- **DOM Content Loaded**: ${vitals.domContentLoaded.toFixed(0)}ms`
      );
    if (vitals.loadComplete !== undefined)
      lines.push(`- **Page Load Complete**: ${vitals.loadComplete.toFixed(0)}ms`);
    if (vitals.jsHeapUsed !== undefined)
      lines.push(
        `- **JS Heap**: ${(vitals.jsHeapUsed / 1024 / 1024).toFixed(2)}MB / ${((vitals.jsHeapTotal || 0) / 1024 / 1024).toFixed(2)}MB`
      );

    if (lines.length === 1) {
      lines.push("No Web Vitals data available. Try navigating to a page first.");
    }

    return lines.join("\n");
  }
}
