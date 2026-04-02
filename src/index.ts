#!/usr/bin/env node

/**
 * CDP Extended MCP Server
 *
 * Exposes 5 Chrome DevTools Protocol domains not covered by cdp-tools:
 * 1. Fetch - Request interception & modification
 * 2. Emulation - Device, geo, media simulation
 * 3. Accessibility - A11y tree inspection & auditing
 * 4. Performance - Metrics, profiling, Core Web Vitals
 * 5. CSS - Stylesheet inspection, modification, coverage
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { CDPClient } from "./cdp-client.js";
import { FetchDomain } from "./domains/fetch.js";
import { EmulationDomain, DEVICE_PRESETS } from "./domains/emulation.js";
import { AccessibilityDomain } from "./domains/accessibility.js";
import { PerformanceDomain } from "./domains/performance.js";
import { CSSDomain } from "./domains/css.js";

// ── State ────────────────────────────────────────────────────────────────────

const client = new CDPClient();
let fetchDomain: FetchDomain | null = null;
let emulationDomain: EmulationDomain | null = null;
let accessibilityDomain: AccessibilityDomain | null = null;
let performanceDomain: PerformanceDomain | null = null;
let cssDomain: CSSDomain | null = null;

function ensureConnected(): void {
  if (!client.isConnected()) {
    throw new Error(
      "Not connected to Chrome. Use the 'connect_cdp' tool first with a WebSocket URL."
    );
  }
}

function getDomains() {
  ensureConnected();
  if (!fetchDomain) fetchDomain = new FetchDomain(client);
  if (!emulationDomain) emulationDomain = new EmulationDomain(client);
  if (!accessibilityDomain)
    accessibilityDomain = new AccessibilityDomain(client);
  if (!performanceDomain) performanceDomain = new PerformanceDomain(client);
  if (!cssDomain) cssDomain = new CSSDomain(client);
  return {
    fetch: fetchDomain,
    emulation: emulationDomain,
    accessibility: accessibilityDomain,
    performance: performanceDomain,
    css: cssDomain,
  };
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "cdp-extended",
  version: "1.0.0",
  description:
    "Extended Chrome DevTools Protocol domains: Fetch interception, Device emulation, Accessibility auditing, Performance profiling, and CSS inspection",
});

// ── Connection Tools ─────────────────────────────────────────────────────────

server.tool(
  "connect_cdp",
  "Connect to a Chrome instance via WebSocket URL. Get the URL from http://localhost:PORT/json/version or from an existing cdp-tools connection.",
  {
    wsUrl: z
      .string()
      .describe(
        "WebSocket debugger URL (e.g. ws://localhost:9222/devtools/page/...)"
      ),
  },
  async ({ wsUrl }) => {
    try {
      await client.connect(wsUrl);
      fetchDomain = new FetchDomain(client);
      emulationDomain = new EmulationDomain(client);
      accessibilityDomain = new AccessibilityDomain(client);
      performanceDomain = new PerformanceDomain(client);
      cssDomain = new CSSDomain(client);
      return { content: [{ type: "text", text: `Connected to Chrome at ${wsUrl}` }] };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Connection failed: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "discover_targets",
  "List available Chrome debugging targets. Use this to find the WebSocket URL to connect to.",
  {
    host: z.string().default("localhost").describe("Chrome host"),
    port: z.number().default(9222).describe("Chrome debugging port"),
  },
  async ({ host, port }) => {
    try {
      const [targets, version] = await Promise.all([
        client.getTargets(host, port),
        client.getVersion(host, port),
      ]);

      const lines = [
        `## Chrome ${version.Browser}`,
        `WebSocket URL: ${version.webSocketDebuggerUrl}`,
        "",
        "## Available Targets",
        "",
      ];

      for (const t of targets) {
        lines.push(`- **${t.title || "(untitled)"}** [${t.type}]`);
        lines.push(`  URL: ${t.url}`);
        lines.push(`  WS: ${t.webSocketDebuggerUrl}`);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to discover targets at ${host}:${port}: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "disconnect_cdp",
  "Disconnect from Chrome",
  {},
  async () => {
    await client.disconnect();
    fetchDomain = null;
    emulationDomain = null;
    accessibilityDomain = null;
    performanceDomain = null;
    cssDomain = null;
    return { content: [{ type: "text", text: "Disconnected from Chrome" }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FETCH DOMAIN TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "fetch_enable",
  "Enable request interception. Optionally specify URL patterns to intercept.",
  {
    patterns: z
      .array(
        z.object({
          urlPattern: z.string().describe("URL wildcard pattern (* and ?)"),
          resourceType: z
            .string()
            .optional()
            .describe(
              "Resource type: Document, Stylesheet, Image, Media, Font, Script, TextTrack, XHR, Fetch, EventSource, WebSocket, Manifest, Other"
            ),
          requestStage: z
            .enum(["Request", "Response"])
            .optional()
            .describe("Intercept at Request or Response stage"),
        })
      )
      .optional()
      .describe("URL patterns to intercept (omit for all requests)"),
    handleAuthRequests: z
      .boolean()
      .optional()
      .describe("Handle HTTP auth challenges"),
  },
  async ({ patterns, handleAuthRequests }) => {
    const d = getDomains();
    const result = await d.fetch.enable(patterns, handleAuthRequests);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "fetch_disable",
  "Disable request interception",
  {},
  async () => {
    const d = getDomains();
    const result = await d.fetch.disable();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "fetch_continue",
  "Continue a paused request, optionally modifying URL, method, headers, or body",
  {
    requestId: z.string().describe("Request ID from paused request"),
    url: z.string().optional().describe("Override URL"),
    method: z.string().optional().describe("Override HTTP method"),
    postData: z.string().optional().describe("Override request body"),
    headers: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .optional()
      .describe("Override headers"),
  },
  async ({ requestId, url, method, postData, headers }) => {
    const d = getDomains();
    const overrides: any = {};
    if (url) overrides.url = url;
    if (method) overrides.method = method;
    if (postData) overrides.postData = postData;
    if (headers) overrides.headers = headers;
    const result = await d.fetch.continueRequest(
      requestId,
      Object.keys(overrides).length > 0 ? overrides : undefined
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "fetch_fulfill",
  "Respond to a paused request with a custom/mock response",
  {
    requestId: z.string().describe("Request ID from paused request"),
    responseCode: z.number().describe("HTTP status code (e.g. 200, 404, 500)"),
    body: z.string().describe("Response body content"),
    headers: z
      .array(z.object({ name: z.string(), value: z.string() }))
      .optional()
      .describe("Response headers"),
  },
  async ({ requestId, responseCode, body, headers }) => {
    const d = getDomains();
    const result = await d.fetch.fulfillRequest(
      requestId,
      responseCode,
      body,
      headers
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "fetch_fail",
  "Fail a paused request with an error",
  {
    requestId: z.string().describe("Request ID from paused request"),
    errorReason: z
      .enum([
        "Failed",
        "Aborted",
        "TimedOut",
        "AccessDenied",
        "ConnectionClosed",
        "ConnectionReset",
        "ConnectionRefused",
        "ConnectionAborted",
        "ConnectionFailed",
        "NameNotResolved",
        "InternetDisconnected",
        "AddressUnreachable",
        "BlockedByClient",
        "BlockedByResponse",
      ])
      .describe("Error reason"),
  },
  async ({ requestId, errorReason }) => {
    const d = getDomains();
    const result = await d.fetch.failRequest(requestId, errorReason);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "fetch_get_body",
  "Get the response body of a paused request (at Response stage)",
  {
    requestId: z.string().describe("Request ID from paused request"),
  },
  async ({ requestId }) => {
    const d = getDomains();
    const result = await d.fetch.getResponseBody(requestId);
    return { content: [{ type: "text", text: result.body }] };
  }
);

server.tool(
  "fetch_list_paused",
  "List all currently paused/intercepted requests",
  {},
  async () => {
    const d = getDomains();
    const requests = d.fetch.listPausedRequests();
    if (requests.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No paused requests. Make sure fetch interception is enabled and requests are being made.",
          },
        ],
      };
    }

    const lines = [`## Paused Requests (${requests.length})\n`];
    for (const r of requests) {
      lines.push(`- **${r.request.method} ${r.request.url}**`);
      lines.push(`  ID: ${r.requestId}`);
      lines.push(`  Type: ${r.resourceType}`);
      if (r.responseStatusCode)
        lines.push(`  Response: ${r.responseStatusCode}`);
      lines.push("");
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// EMULATION DOMAIN TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "emulate_device",
  "Emulate a specific device (iPhone, Pixel, iPad, etc.) with correct viewport, DPR, user agent, and touch",
  {
    device: z
      .enum([
        "iphone-15",
        "iphone-15-pro-max",
        "pixel-8",
        "ipad-pro-12",
        "galaxy-s24",
        "desktop",
      ])
      .describe("Device preset to emulate"),
  },
  async ({ device }) => {
    const d = getDomains();
    const result = await d.emulation.emulateDevice(device);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_custom_device",
  "Set custom device metrics (viewport size, scale, mobile mode)",
  {
    width: z.number().describe("Viewport width in pixels"),
    height: z.number().describe("Viewport height in pixels"),
    deviceScaleFactor: z.number().default(1).describe("Device pixel ratio"),
    mobile: z.boolean().default(false).describe("Emulate mobile device"),
  },
  async ({ width, height, deviceScaleFactor, mobile }) => {
    const d = getDomains();
    const result = await d.emulation.setDeviceMetrics(
      width,
      height,
      deviceScaleFactor,
      mobile
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_geolocation",
  "Fake the browser's geolocation to any coordinates",
  {
    latitude: z.number().describe("Latitude (-90 to 90)"),
    longitude: z.number().describe("Longitude (-180 to 180)"),
    accuracy: z.number().optional().describe("Accuracy in meters"),
  },
  async ({ latitude, longitude, accuracy }) => {
    const d = getDomains();
    const result = await d.emulation.setGeolocation(
      latitude,
      longitude,
      accuracy
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_timezone",
  "Override the browser's timezone",
  {
    timezoneId: z
      .string()
      .describe(
        "IANA timezone ID (e.g. America/New_York, Europe/London, Asia/Tokyo)"
      ),
  },
  async ({ timezoneId }) => {
    const d = getDomains();
    const result = await d.emulation.setTimezone(timezoneId);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_locale",
  "Override the browser's locale for i18n testing",
  {
    locale: z
      .string()
      .describe("Locale string (e.g. en-US, fr-FR, ja-JP, zh-CN)"),
  },
  async ({ locale }) => {
    const d = getDomains();
    const result = await d.emulation.setLocale(locale);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_user_agent",
  "Override the browser's user agent string",
  {
    userAgent: z.string().describe("User agent string"),
    acceptLanguage: z
      .string()
      .optional()
      .describe("Accept-Language header value"),
    platform: z
      .string()
      .optional()
      .describe("Navigator.platform override"),
  },
  async ({ userAgent, acceptLanguage, platform }) => {
    const d = getDomains();
    const result = await d.emulation.setUserAgent(
      userAgent,
      acceptLanguage,
      platform
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_dark_mode",
  "Toggle dark mode (prefers-color-scheme)",
  {
    enabled: z.boolean().describe("Enable dark mode"),
  },
  async ({ enabled }) => {
    const d = getDomains();
    const result = await d.emulation.setDarkMode(enabled);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_reduced_motion",
  "Toggle reduced motion preference",
  {
    enabled: z.boolean().describe("Enable reduced motion"),
  },
  async ({ enabled }) => {
    const d = getDomains();
    const result = await d.emulation.setReducedMotion(enabled);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_vision_deficiency",
  "Simulate vision deficiencies (color blindness, blurred vision)",
  {
    type: z
      .enum([
        "none",
        "blurredVision",
        "deuteranopia",
        "protanopia",
        "tritanopia",
        "achromatopsia",
      ])
      .describe(
        "Vision deficiency type: deuteranopia (green-blind), protanopia (red-blind), tritanopia (blue-blind), achromatopsia (full color blind), blurredVision, none (reset)"
      ),
  },
  async ({ type }) => {
    const d = getDomains();
    const result = await d.emulation.setVisionDeficiency(type);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_cpu_throttle",
  "Throttle CPU to simulate slower devices",
  {
    rate: z
      .number()
      .describe(
        "Throttling rate (1 = no throttle, 4 = 4x slower, 6 = 6x slower for low-end mobile)"
      ),
  },
  async ({ rate }) => {
    const d = getDomains();
    const result = await d.emulation.setCPUThrottling(rate);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_touch",
  "Toggle touch emulation",
  {
    enabled: z.boolean().describe("Enable touch emulation"),
    maxTouchPoints: z.number().optional().describe("Max touch points (default 5)"),
  },
  async ({ enabled, maxTouchPoints }) => {
    const d = getDomains();
    const result = await d.emulation.setTouchEmulation(
      enabled,
      maxTouchPoints
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "emulate_clear_all",
  "Clear all emulation overrides and reset to defaults",
  {},
  async () => {
    const d = getDomains();
    await d.emulation.clearDeviceMetrics();
    await d.emulation.clearGeolocation();
    await d.emulation.setVisionDeficiency("none");
    await d.emulation.setCPUThrottling(1);
    await d.emulation.setTouchEmulation(false);
    return {
      content: [
        { type: "text", text: "All emulation overrides cleared" },
      ],
    };
  }
);

server.tool(
  "emulate_list_devices",
  "List all available device presets for emulation",
  {},
  async () => {
    const lines = ["## Available Device Presets\n"];
    for (const [id, preset] of Object.entries(DEVICE_PRESETS)) {
      lines.push(
        `- **${id}**: ${preset.name} (${preset.width}x${preset.height} @${preset.deviceScaleFactor}x, mobile: ${preset.mobile})`
      );
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY DOMAIN TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "a11y_audit",
  "Run an accessibility audit on the current page. Checks for missing alt text, unlabeled buttons/links, form inputs without labels, empty headings, and clickable elements without roles.",
  {},
  async () => {
    const d = getDomains();
    const issues = await d.accessibility.audit();

    if (issues.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No accessibility issues found! The page passes basic a11y checks.",
          },
        ],
      };
    }

    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");

    const lines = [
      `## Accessibility Audit Results`,
      `- **Errors**: ${errors.length}`,
      `- **Warnings**: ${warnings.length}`,
      "",
    ];

    if (errors.length > 0) {
      lines.push("### Errors\n");
      for (const issue of errors) {
        lines.push(
          `- [${issue.type}] ${issue.message}${issue.role ? ` (role: ${issue.role})` : ""}`
        );
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("### Warnings\n");
      for (const issue of warnings) {
        lines.push(
          `- [${issue.type}] ${issue.message}${issue.role ? ` (role: ${issue.role})` : ""}`
        );
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "a11y_tree",
  "Get the accessibility tree for the current page (what screen readers see)",
  {
    depth: z
      .number()
      .optional()
      .describe("Max tree depth (default: full tree)"),
    maxDisplay: z
      .number()
      .default(100)
      .describe("Max nodes to display in formatted output"),
  },
  async ({ depth, maxDisplay }) => {
    const d = getDomains();
    const nodes = await d.accessibility.getFullTree(depth);
    const formatted = d.accessibility.formatTree(nodes, maxDisplay);
    return {
      content: [
        {
          type: "text",
          text: `## Accessibility Tree (${nodes.length} nodes)\n\n\`\`\`\n${formatted}\n\`\`\``,
        },
      ],
    };
  }
);

server.tool(
  "a11y_query",
  "Search the accessibility tree by role and/or accessible name",
  {
    role: z
      .string()
      .optional()
      .describe(
        "ARIA role to search for (e.g. button, link, heading, textbox, img)"
      ),
    name: z.string().optional().describe("Accessible name to search for"),
  },
  async ({ role, name }) => {
    const d = getDomains();
    const nodes = await d.accessibility.queryTree({
      role,
      accessibleName: name,
    });

    if (nodes.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No accessibility nodes found matching role=${role || "any"}, name=${name || "any"}`,
          },
        ],
      };
    }

    const lines = [`## Found ${nodes.length} node(s)\n`];
    for (const node of nodes.slice(0, 50)) {
      const r = node.role?.value || "unknown";
      const n = node.name?.value || "";
      const v = node.value?.value || "";
      let line = `- [${r}]`;
      if (n) line += ` "${n}"`;
      if (v) line += ` = ${v}`;
      lines.push(line);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE DOMAIN TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "perf_metrics",
  "Get current runtime performance metrics (DOM nodes, event listeners, layout counts, JS heap, etc.)",
  {},
  async () => {
    const d = getDomains();
    const result = await d.performance.getFormattedMetrics();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "perf_web_vitals",
  "Get Core Web Vitals (LCP, CLS, FCP, TTFB) with GOOD/NEEDS IMPROVEMENT/POOR ratings",
  {},
  async () => {
    const d = getDomains();
    const result = await d.performance.getCoreWebVitals();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "perf_cpu_profile_start",
  "Start CPU profiling. Perform the actions you want to profile, then call perf_cpu_profile_stop.",
  {},
  async () => {
    const d = getDomains();
    const result = await d.performance.startCPUProfile();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "perf_cpu_profile_stop",
  "Stop CPU profiling and get the results with top functions by CPU time",
  {},
  async () => {
    const d = getDomains();
    const { summary } = await d.performance.stopCPUProfile();
    return { content: [{ type: "text", text: summary }] };
  }
);

server.tool(
  "perf_heap_snapshot",
  "Take a heap memory snapshot to find memory leaks",
  {},
  async () => {
    const d = getDomains();
    const result = await d.performance.takeHeapSnapshot();
    return { content: [{ type: "text", text: result }] };
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// CSS DOMAIN TOOLS
// ══════════════════════════════════════════════════════════════════════════════

server.tool(
  "css_computed_style",
  "Get computed CSS styles for an element. Optionally filter to specific properties.",
  {
    selector: z
      .string()
      .describe("CSS selector for the element (e.g. .header, #main, button)"),
    properties: z
      .array(z.string())
      .optional()
      .describe(
        "Specific properties to return (e.g. ['color', 'font-size', 'margin']). Omit for all."
      ),
  },
  async ({ selector, properties }) => {
    const d = getDomains();
    const styles = properties
      ? await d.css.getComputedStyleFiltered(selector, properties)
      : await d.css.getComputedStyle(selector);

    const lines = [`## Computed Styles for \`${selector}\`\n`];
    for (const s of styles.slice(0, 100)) {
      lines.push(`- **${s.name}**: ${s.value}`);
    }
    if (styles.length > 100) lines.push(`\n... and ${styles.length - 100} more`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "css_matched_rules",
  "Get all CSS rules matching an element (inline, matched, inherited, pseudo-elements)",
  {
    selector: z.string().describe("CSS selector for the element"),
  },
  async ({ selector }) => {
    const d = getDomains();
    const result = await d.css.getMatchedStyles(selector);

    const lines = [`## Matched CSS Rules for \`${selector}\`\n`];

    if (result.inlineStyle?.cssProperties?.length > 0) {
      lines.push("### Inline Styles");
      for (const prop of result.inlineStyle.cssProperties) {
        if (prop.text) lines.push(`- ${prop.text}`);
      }
      lines.push("");
    }

    if (result.matchedRules.length > 0) {
      lines.push(`### Matched Rules (${result.matchedRules.length})\n`);
      for (const match of result.matchedRules.slice(0, 20)) {
        const rule = match.rule;
        const selectorText =
          rule?.selectorList?.selectors
            ?.map((s: any) => s.text)
            .join(", ") || "unknown";
        lines.push(`**${selectorText}**`);
        if (rule?.style?.cssProperties) {
          for (const prop of rule.style.cssProperties) {
            if (prop.text && !prop.disabled) lines.push(`  ${prop.text}`);
          }
        }
        lines.push("");
      }
    }

    if (result.inherited.length > 0) {
      lines.push(`### Inherited Styles (${result.inherited.length} ancestors)\n`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "css_background_colors",
  "Get background colors and font info for an element (useful for contrast checking)",
  {
    selector: z.string().describe("CSS selector for the element"),
  },
  async ({ selector }) => {
    const d = getDomains();
    const result = await d.css.getBackgroundColors(selector);
    const lines = [
      `## Background Colors for \`${selector}\`\n`,
      `- **Background colors**: ${result.backgroundColors.join(", ") || "none"}`,
      `- **Font size**: ${result.computedFontSize}`,
      `- **Font weight**: ${result.computedFontWeight}`,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "css_force_pseudo",
  "Force pseudo-states on an element (e.g. :hover, :focus, :active) for testing",
  {
    selector: z.string().describe("CSS selector for the element"),
    pseudoClasses: z
      .array(
        z.enum([
          "active",
          "focus",
          "focus-within",
          "focus-visible",
          "hover",
          "visited",
          "target",
        ])
      )
      .describe("Pseudo-classes to force"),
  },
  async ({ selector, pseudoClasses }) => {
    const d = getDomains();
    const result = await d.css.forcePseudoState(selector, pseudoClasses);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "css_fonts",
  "Get the actual fonts used to render an element (not just font-family, the actual loaded fonts)",
  {
    selector: z.string().describe("CSS selector for the element"),
  },
  async ({ selector }) => {
    const d = getDomains();
    const fonts = await d.css.getPlatformFonts(selector);

    const lines = [`## Fonts Used for \`${selector}\`\n`];
    for (const f of fonts) {
      lines.push(
        `- **${f.familyName}** (${f.isCustomFont ? "web font" : "system font"}, ${f.glyphCount} glyphs)`
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "css_media_queries",
  "List all media queries used across all stylesheets",
  {},
  async () => {
    const d = getDomains();
    const medias = await d.css.getMediaQueries();

    if (medias.length === 0) {
      return {
        content: [
          { type: "text", text: "No media queries found on this page." },
        ],
      };
    }

    const lines = [`## Media Queries (${medias.length})\n`];
    for (const m of medias.slice(0, 50)) {
      lines.push(`- \`${m.text}\` (source: ${m.source})`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "css_coverage_start",
  "Start tracking CSS rule usage. Browse around, then call css_coverage_stop to see which rules are unused.",
  {},
  async () => {
    const d = getDomains();
    const result = await d.css.startCoverageTracking();
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "css_coverage_stop",
  "Stop CSS coverage tracking and get the report showing used vs unused rules",
  {},
  async () => {
    const d = getDomains();
    const { summary } = await d.css.stopCoverageTracking();
    return { content: [{ type: "text", text: summary }] };
  }
);

server.tool(
  "css_set_property",
  "Set a CSS property value on an element (live modification)",
  {
    selector: z.string().describe("CSS selector for the element"),
    property: z.string().describe("CSS property name (e.g. color, font-size)"),
    value: z.string().describe("CSS property value (e.g. red, 16px)"),
  },
  async ({ selector, property, value }) => {
    const d = getDomains();
    const result = await d.css.setEffectivePropertyValue(
      selector,
      property,
      value
    );
    return { content: [{ type: "text", text: result }] };
  }
);

// ── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CDP Extended MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
