/**
 * CSS Domain - Stylesheet Inspection, Modification, and Auditing
 *
 * - Get computed styles for any element
 * - Get all matching CSS rules
 * - Modify stylesheets live
 * - Track CSS coverage (unused CSS)
 * - Get fonts used on page
 * - Force pseudo-states (:hover, :focus, etc.)
 * - Get background colors / contrast info
 */

import type { CDPClient } from "../cdp-client.js";

export class CSSDomain {
  private client: CDPClient;
  private enabled = false;

  constructor(client: CDPClient) {
    this.client = client;
  }

  async enable(): Promise<string> {
    await this.client.send("DOM.enable");
    await this.client.send("CSS.enable");
    this.enabled = true;
    return "CSS domain enabled";
  }

  async disable(): Promise<string> {
    await this.client.send("CSS.disable");
    this.enabled = false;
    return "CSS domain disabled";
  }

  private async resolveSelector(selector: string): Promise<number> {
    // Get document root
    const doc = await this.client.send("DOM.getDocument", { depth: 0 });
    const rootNodeId = (doc.root as any).nodeId;

    // Query selector
    const result = await this.client.send("DOM.querySelector", {
      nodeId: rootNodeId,
      selector,
    });

    const nodeId = result.nodeId as number;
    if (!nodeId || nodeId === 0) {
      throw new Error(`Element not found: ${selector}`);
    }
    return nodeId;
  }

  async getComputedStyle(
    selector: string
  ): Promise<Array<{ name: string; value: string }>> {
    if (!this.enabled) await this.enable();

    const nodeId = await this.resolveSelector(selector);
    const result = await this.client.send("CSS.getComputedStyleForNode", {
      nodeId,
    });

    return result.computedStyle as Array<{ name: string; value: string }>;
  }

  async getComputedStyleFiltered(
    selector: string,
    properties: string[]
  ): Promise<Array<{ name: string; value: string }>> {
    const allStyles = await this.getComputedStyle(selector);
    const propSet = new Set(properties.map((p) => p.toLowerCase()));
    return allStyles.filter((s) => propSet.has(s.name.toLowerCase()));
  }

  async getMatchedStyles(selector: string): Promise<{
    inlineStyle: any;
    matchedRules: any[];
    inherited: any[];
    pseudoElements: any[];
  }> {
    if (!this.enabled) await this.enable();

    const nodeId = await this.resolveSelector(selector);
    const result = await this.client.send("CSS.getMatchedStylesForNode", {
      nodeId,
    });

    return {
      inlineStyle: result.inlineStyle,
      matchedRules: result.matchedCSSRules as any[] || [],
      inherited: result.inherited as any[] || [],
      pseudoElements: result.pseudoElements as any[] || [],
    };
  }

  async getInlineStyles(selector: string): Promise<{
    inlineStyle: any;
    attributesStyle: any;
  }> {
    if (!this.enabled) await this.enable();

    const nodeId = await this.resolveSelector(selector);
    const result = await this.client.send("CSS.getInlineStylesForNode", {
      nodeId,
    });

    return {
      inlineStyle: result.inlineStyle,
      attributesStyle: result.attributesStyle,
    };
  }

  async getBackgroundColors(selector: string): Promise<{
    backgroundColors: string[];
    computedFontSize: string;
    computedFontWeight: string;
  }> {
    if (!this.enabled) await this.enable();

    const nodeId = await this.resolveSelector(selector);
    const result = await this.client.send("CSS.getBackgroundColors", {
      nodeId,
    });

    return {
      backgroundColors: result.backgroundColors as string[] || [],
      computedFontSize: result.computedFontSize as string || "",
      computedFontWeight: result.computedFontWeight as string || "",
    };
  }

  async forcePseudoState(
    selector: string,
    pseudoClasses: string[]
  ): Promise<string> {
    if (!this.enabled) await this.enable();

    const nodeId = await this.resolveSelector(selector);
    await this.client.send("CSS.forcePseudoState", {
      nodeId,
      forcedPseudoClasses: pseudoClasses,
    });

    return `Forced pseudo-states on ${selector}: ${pseudoClasses.join(", ")}`;
  }

  async getPlatformFonts(selector: string): Promise<
    Array<{
      familyName: string;
      isCustomFont: boolean;
      glyphCount: number;
    }>
  > {
    if (!this.enabled) await this.enable();

    const nodeId = await this.resolveSelector(selector);
    const result = await this.client.send("CSS.getPlatformFontsForNode", {
      nodeId,
    });

    return result.fonts as any[];
  }

  async getMediaQueries(): Promise<any[]> {
    if (!this.enabled) await this.enable();
    const result = await this.client.send("CSS.getMediaQueries");
    return result.medias as any[] || [];
  }

  // CSS Coverage
  async startCoverageTracking(): Promise<string> {
    if (!this.enabled) await this.enable();
    await this.client.send("CSS.startRuleUsageTracking");
    return "CSS coverage tracking started. Browse the site, then call stopCoverageTracking.";
  }

  async stopCoverageTracking(): Promise<{
    summary: string;
    coverage: Array<{ styleSheetId: string; startOffset: number; endOffset: number; used: boolean }>;
  }> {
    const result = await this.client.send("CSS.stopRuleUsageTracking");
    const rules = result.ruleUsage as Array<{
      styleSheetId: string;
      startOffset: number;
      endOffset: number;
      used: boolean;
    }>;

    const total = rules.length;
    const used = rules.filter((r) => r.used).length;
    const unused = total - used;
    const pct = total > 0 ? ((used / total) * 100).toFixed(1) : "0";

    const summary = [
      "## CSS Coverage Report",
      `- **Total rules**: ${total}`,
      `- **Used rules**: ${used} (${pct}%)`,
      `- **Unused rules**: ${unused} (${(100 - parseFloat(pct)).toFixed(1)}%)`,
    ].join("\n");

    return { summary, coverage: rules };
  }

  async getStyleSheetText(styleSheetId: string): Promise<string> {
    if (!this.enabled) await this.enable();
    const result = await this.client.send("CSS.getStyleSheetText", {
      styleSheetId,
    });
    return result.text as string;
  }

  async setStyleTexts(
    edits: Array<{
      styleSheetId: string;
      range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
      text: string;
    }>
  ): Promise<string> {
    if (!this.enabled) await this.enable();
    await this.client.send("CSS.setStyleTexts", { edits });
    return `Applied ${edits.length} style edit(s)`;
  }

  async addRule(
    styleSheetId: string,
    ruleText: string,
    location: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  ): Promise<any> {
    if (!this.enabled) await this.enable();
    const result = await this.client.send("CSS.addRule", {
      styleSheetId,
      ruleText,
      location,
    });
    return result.rule;
  }

  async collectClassNames(styleSheetId: string): Promise<string[]> {
    if (!this.enabled) await this.enable();
    const result = await this.client.send("CSS.collectClassNames", {
      styleSheetId,
    });
    return result.classNames as string[];
  }

  async setEffectivePropertyValue(
    selector: string,
    propertyName: string,
    value: string
  ): Promise<string> {
    if (!this.enabled) await this.enable();
    const nodeId = await this.resolveSelector(selector);
    await this.client.send("CSS.setEffectivePropertyValueForNode", {
      nodeId,
      propertyName,
      value,
    });
    return `Set ${propertyName}: ${value} on ${selector}`;
  }
}
