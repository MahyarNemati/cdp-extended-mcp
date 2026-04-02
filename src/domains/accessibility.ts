/**
 * Accessibility Domain - A11y Tree Inspection & Auditing
 *
 * - Get full accessibility tree
 * - Query nodes by role or accessible name
 * - Audit for missing labels, roles, alt text
 * - Check ARIA compliance
 */

import type { CDPClient } from "../cdp-client.js";

export interface AXNode {
  nodeId: string;
  ignored: boolean;
  role?: { type: string; value: string };
  name?: { type: string; value: string; sources?: unknown[] };
  description?: { type: string; value: string };
  value?: { type: string; value: unknown };
  properties?: Array<{
    name: string;
    value: { type: string; value: unknown };
  }>;
  childIds?: string[];
  backendDOMNodeId?: number;
}

export interface A11yIssue {
  type: string;
  severity: "error" | "warning" | "info";
  message: string;
  nodeId?: string;
  role?: string;
  name?: string;
}

export class AccessibilityDomain {
  private client: CDPClient;
  private enabled = false;

  constructor(client: CDPClient) {
    this.client = client;
  }

  async enable(): Promise<string> {
    await this.client.send("Accessibility.enable");
    this.enabled = true;
    return "Accessibility domain enabled";
  }

  async disable(): Promise<string> {
    await this.client.send("Accessibility.disable");
    this.enabled = false;
    return "Accessibility domain disabled";
  }

  async getFullTree(depth?: number, frameId?: string): Promise<AXNode[]> {
    if (!this.enabled) await this.enable();

    const params: Record<string, unknown> = {};
    if (depth !== undefined) params.depth = depth;
    if (frameId) params.frameId = frameId;

    const result = await this.client.send(
      "Accessibility.getFullAXTree",
      params
    );
    return (result.nodes as AXNode[]) || [];
  }

  async getRootNode(frameId?: string): Promise<AXNode> {
    if (!this.enabled) await this.enable();

    const params: Record<string, unknown> = {};
    if (frameId) params.frameId = frameId;

    const result = await this.client.send(
      "Accessibility.getRootAXNode",
      params
    );
    return result.node as AXNode;
  }

  async queryTree(
    options: {
      accessibleName?: string;
      role?: string;
      nodeId?: number;
    }
  ): Promise<AXNode[]> {
    if (!this.enabled) await this.enable();

    const params: Record<string, unknown> = {};
    if (options.accessibleName) params.accessibleName = options.accessibleName;
    if (options.role) params.role = options.role;
    if (options.nodeId) params.backendNodeId = options.nodeId;

    const result = await this.client.send(
      "Accessibility.queryAXTree",
      params
    );
    return (result.nodes as AXNode[]) || [];
  }

  async getNodeAndAncestors(
    nodeId?: number,
    objectId?: string
  ): Promise<AXNode[]> {
    if (!this.enabled) await this.enable();

    const params: Record<string, unknown> = {};
    if (nodeId) params.backendNodeId = nodeId;
    if (objectId) params.objectId = objectId;

    const result = await this.client.send(
      "Accessibility.getAXNodeAndAncestors",
      params
    );
    return (result.nodes as AXNode[]) || [];
  }

  async getChildNodes(
    axNodeId: string,
    frameId?: string
  ): Promise<AXNode[]> {
    if (!this.enabled) await this.enable();

    const params: Record<string, unknown> = { id: axNodeId };
    if (frameId) params.frameId = frameId;

    const result = await this.client.send(
      "Accessibility.getChildAXNodes",
      params
    );
    return (result.nodes as AXNode[]) || [];
  }

  async audit(): Promise<A11yIssue[]> {
    if (!this.enabled) await this.enable();

    const nodes = await this.getFullTree(undefined, undefined);
    const issues: A11yIssue[] = [];

    for (const node of nodes) {
      if (node.ignored) continue;

      const role = node.role?.value;
      const name = node.name?.value;

      // Images without alt text
      if (role === "img" && (!name || String(name).trim() === "")) {
        issues.push({
          type: "missing-alt-text",
          severity: "error",
          message: "Image element is missing alternative text",
          nodeId: node.nodeId,
          role,
        });
      }

      // Buttons/links without accessible names
      if (
        (role === "button" || role === "link") &&
        (!name || String(name).trim() === "")
      ) {
        issues.push({
          type: "missing-accessible-name",
          severity: "error",
          message: `${role} element has no accessible name`,
          nodeId: node.nodeId,
          role,
        });
      }

      // Form inputs without labels
      if (
        (role === "textbox" ||
          role === "combobox" ||
          role === "searchbox" ||
          role === "spinbutton" ||
          role === "checkbox" ||
          role === "radio") &&
        (!name || String(name).trim() === "")
      ) {
        issues.push({
          type: "missing-label",
          severity: "error",
          message: `Form ${role} element has no label`,
          nodeId: node.nodeId,
          role,
        });
      }

      // Headings without text
      if (
        role &&
        role.startsWith("heading") &&
        (!name || String(name).trim() === "")
      ) {
        issues.push({
          type: "empty-heading",
          severity: "warning",
          message: "Heading element has no text content",
          nodeId: node.nodeId,
          role,
        });
      }

      // Clickable elements without semantic roles
      if (role === "generic" && node.properties) {
        const hasClickHandler = node.properties.some(
          (p) => p.name === "clickable" && p.value.value === true
        );
        if (hasClickHandler) {
          issues.push({
            type: "clickable-without-role",
            severity: "warning",
            message:
              "Clickable element has generic role - consider adding a semantic role",
            nodeId: node.nodeId,
            role,
          });
        }
      }
    }

    return issues;
  }

  formatTree(nodes: AXNode[], maxDepth = 5): string {
    const nodeMap = new Map<string, AXNode>();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }

    const lines: string[] = [];

    const printNode = (node: AXNode, depth: number) => {
      if (depth > maxDepth || node.ignored) return;

      const indent = "  ".repeat(depth);
      const role = node.role?.value || "unknown";
      const name = node.name?.value || "";
      const value = node.value?.value;

      let line = `${indent}[${role}]`;
      if (name) line += ` "${name}"`;
      if (value !== undefined && value !== "") line += ` = ${value}`;

      if (node.properties && node.properties.length > 0) {
        const props = node.properties
          .filter((p) => p.value.value !== false && p.value.value !== "")
          .map((p) => `${p.name}: ${p.value.value}`)
          .join(", ");
        if (props) line += ` (${props})`;
      }

      lines.push(line);

      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = nodeMap.get(childId);
          if (child) {
            printNode(child, depth + 1);
          }
        }
      }
    };

    if (nodes.length > 0) {
      printNode(nodes[0]!, 0);
    }

    return lines.join("\n");
  }
}
