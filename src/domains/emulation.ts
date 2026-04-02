/**
 * Emulation Domain - Device, Geo, Media, and Environment Simulation
 *
 * - Emulate mobile devices (iPhone, Pixel, iPad)
 * - Fake geolocation
 * - Override timezone, locale, user agent
 * - Simulate vision deficiencies
 * - Override media features (dark mode, reduced motion)
 * - CPU throttling
 * - Touch emulation
 */

import type { CDPClient } from "../cdp-client.js";

export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent: string;
}

export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  "iphone-15": {
    name: "iPhone 15",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  "iphone-15-pro-max": {
    name: "iPhone 15 Pro Max",
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  "pixel-8": {
    name: "Pixel 8",
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  },
  "ipad-pro-12": {
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    mobile: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  "galaxy-s24": {
    name: "Samsung Galaxy S24",
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  },
  desktop: {
    name: "Desktop",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
    userAgent: "",
  },
};

export class EmulationDomain {
  private client: CDPClient;

  constructor(client: CDPClient) {
    this.client = client;
  }

  async setDeviceMetrics(
    width: number,
    height: number,
    deviceScaleFactor: number,
    mobile: boolean
  ): Promise<string> {
    await this.client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    return `Device metrics set: ${width}x${height} @${deviceScaleFactor}x, mobile: ${mobile}`;
  }

  async emulateDevice(deviceId: string): Promise<string> {
    const preset = DEVICE_PRESETS[deviceId];
    if (!preset) {
      const available = Object.keys(DEVICE_PRESETS).join(", ");
      throw new Error(
        `Unknown device: ${deviceId}. Available: ${available}`
      );
    }

    await this.setDeviceMetrics(
      preset.width,
      preset.height,
      preset.deviceScaleFactor,
      preset.mobile
    );

    if (preset.userAgent) {
      await this.setUserAgent(preset.userAgent);
    }

    if (preset.mobile) {
      await this.setTouchEmulation(true);
    }

    return `Emulating ${preset.name} (${preset.width}x${preset.height} @${preset.deviceScaleFactor}x)`;
  }

  async clearDeviceMetrics(): Promise<string> {
    await this.client.send("Emulation.clearDeviceMetricsOverride");
    return "Device metrics override cleared";
  }

  async setGeolocation(
    latitude: number,
    longitude: number,
    accuracy?: number
  ): Promise<string> {
    await this.client.send("Emulation.setGeolocationOverride", {
      latitude,
      longitude,
      accuracy: accuracy ?? 1,
    });
    return `Geolocation set to ${latitude}, ${longitude}`;
  }

  async clearGeolocation(): Promise<string> {
    await this.client.send("Emulation.clearGeolocationOverride");
    return "Geolocation override cleared";
  }

  async setTimezone(timezoneId: string): Promise<string> {
    await this.client.send("Emulation.setTimezoneOverride", { timezoneId });
    return `Timezone set to ${timezoneId}`;
  }

  async setLocale(locale: string): Promise<string> {
    await this.client.send("Emulation.setLocaleOverride", { locale });
    return `Locale set to ${locale}`;
  }

  async setUserAgent(
    userAgent: string,
    acceptLanguage?: string,
    platform?: string
  ): Promise<string> {
    const params: Record<string, unknown> = { userAgent };
    if (acceptLanguage) params.acceptLanguage = acceptLanguage;
    if (platform) params.platform = platform;
    await this.client.send("Emulation.setUserAgentOverride", params);
    return `User agent set to: ${userAgent.substring(0, 60)}...`;
  }

  async setEmulatedMedia(
    media?: string,
    features?: Array<{ name: string; value: string }>
  ): Promise<string> {
    const params: Record<string, unknown> = {};
    if (media) params.media = media;
    if (features) params.features = features;
    await this.client.send("Emulation.setEmulatedMedia", params);

    const parts: string[] = [];
    if (media) parts.push(`media: ${media}`);
    if (features) parts.push(`features: ${features.map((f) => `${f.name}=${f.value}`).join(", ")}`);
    return `Emulated media set: ${parts.join(", ")}`;
  }

  async setDarkMode(enabled: boolean): Promise<string> {
    await this.setEmulatedMedia(undefined, [
      {
        name: "prefers-color-scheme",
        value: enabled ? "dark" : "light",
      },
    ]);
    return `Dark mode ${enabled ? "enabled" : "disabled"}`;
  }

  async setReducedMotion(enabled: boolean): Promise<string> {
    await this.setEmulatedMedia(undefined, [
      {
        name: "prefers-reduced-motion",
        value: enabled ? "reduce" : "no-preference",
      },
    ]);
    return `Reduced motion ${enabled ? "enabled" : "disabled"}`;
  }

  async setVisionDeficiency(
    type:
      | "none"
      | "blurredVision"
      | "deuteranopia"
      | "protanopia"
      | "tritanopia"
      | "achromatopsia"
  ): Promise<string> {
    await this.client.send("Emulation.setEmulatedVisionDeficiency", {
      type,
    });
    return `Vision deficiency emulation: ${type}`;
  }

  async setCPUThrottling(rate: number): Promise<string> {
    await this.client.send("Emulation.setCPUThrottlingRate", { rate });
    return `CPU throttling set to ${rate}x slowdown`;
  }

  async setTouchEmulation(
    enabled: boolean,
    maxTouchPoints?: number
  ): Promise<string> {
    await this.client.send("Emulation.setTouchEmulationEnabled", {
      enabled,
      maxTouchPoints: maxTouchPoints ?? 5,
    });
    return `Touch emulation ${enabled ? "enabled" : "disabled"}`;
  }

  async disableScriptExecution(): Promise<string> {
    await this.client.send("Emulation.setScriptExecutionDisabled", {
      value: true,
    });
    return "JavaScript execution disabled";
  }

  async enableScriptExecution(): Promise<string> {
    await this.client.send("Emulation.setScriptExecutionDisabled", {
      value: false,
    });
    return "JavaScript execution enabled";
  }

  listDevices(): DevicePreset[] {
    return Object.entries(DEVICE_PRESETS).map(([id, preset]) => ({
      ...preset,
      id,
    })) as any;
  }
}
