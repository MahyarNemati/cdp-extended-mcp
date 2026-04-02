# cdp-extended-mcp

An MCP (Model Context Protocol) server that exposes **5 powerful Chrome DevTools Protocol domains** that are missing from existing tools:

1. **Fetch** — Intercept & modify HTTP requests mid-flight (mock APIs, block tracking, inject headers)
2. **Emulation** — Device simulation (iPhone/Pixel/iPad presets, geolocation, timezone, dark mode, vision deficiencies)
3. **Accessibility** — A11y tree inspection & automated auditing (missing labels, alt text, ARIA compliance)
4. **Performance** — Runtime metrics, CPU profiling, heap snapshots, Core Web Vitals
5. **CSS** — Computed styles, matched rules, font inspection, coverage tracking, live modification

## 38 Tools Available

### Connection
| Tool | Description |
|------|-------------|
| `connect_cdp` | Connect to Chrome via WebSocket URL |
| `discover_targets` | List available Chrome debugging targets |
| `disconnect_cdp` | Disconnect from Chrome |

### Fetch (Request Interception)
| Tool | Description |
|------|-------------|
| `fetch_enable` | Enable request interception with URL patterns |
| `fetch_disable` | Disable interception |
| `fetch_continue` | Continue paused request with optional modifications |
| `fetch_fulfill` | Respond with custom/mock response |
| `fetch_fail` | Fail a request with an error |
| `fetch_get_body` | Get response body of intercepted request |
| `fetch_list_paused` | List all paused requests |

### Emulation (Device Simulation)
| Tool | Description |
|------|-------------|
| `emulate_device` | Emulate iPhone, Pixel, iPad, Galaxy, Desktop |
| `emulate_custom_device` | Custom viewport, DPR, mobile mode |
| `emulate_geolocation` | Fake geolocation to any coordinates |
| `emulate_timezone` | Override timezone |
| `emulate_locale` | Override locale for i18n testing |
| `emulate_user_agent` | Override user agent string |
| `emulate_dark_mode` | Toggle dark mode |
| `emulate_reduced_motion` | Toggle reduced motion |
| `emulate_vision_deficiency` | Simulate color blindness, blurred vision |
| `emulate_cpu_throttle` | Throttle CPU for low-end device simulation |
| `emulate_touch` | Toggle touch emulation |
| `emulate_clear_all` | Reset all emulation overrides |
| `emulate_list_devices` | List available device presets |

### Accessibility
| Tool | Description |
|------|-------------|
| `a11y_audit` | Automated a11y audit (missing labels, alt text, etc.) |
| `a11y_tree` | Get full accessibility tree |
| `a11y_query` | Search a11y tree by role/name |

### Performance
| Tool | Description |
|------|-------------|
| `perf_metrics` | Runtime performance metrics |
| `perf_web_vitals` | Core Web Vitals with ratings |
| `perf_cpu_profile_start` | Start CPU profiling |
| `perf_cpu_profile_stop` | Stop profiling, get hotspot analysis |
| `perf_heap_snapshot` | Take heap memory snapshot |

### CSS
| Tool | Description |
|------|-------------|
| `css_computed_style` | Get computed styles (optionally filtered) |
| `css_matched_rules` | Get all matching CSS rules |
| `css_background_colors` | Background colors + font info |
| `css_force_pseudo` | Force :hover, :focus, :active states |
| `css_fonts` | Get actual rendered fonts |
| `css_media_queries` | List all media queries |
| `css_coverage_start` | Start CSS coverage tracking |
| `css_coverage_stop` | Get used vs unused CSS report |
| `css_set_property` | Live-modify CSS properties |

## Quick Start

### Install

```bash
npm install -g cdp-extended-mcp
```

### Configure with Claude Code

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "cdp-extended": {
      "command": "cdp-extended-mcp"
    }
  }
}
```

### Configure with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cdp-extended": {
      "command": "npx",
      "args": ["cdp-extended-mcp"]
    }
  }
}
```

### Usage

1. Launch Chrome with debugging enabled:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```

2. Use `discover_targets` to find available pages
3. Use `connect_cdp` with the WebSocket URL
4. Use any of the 38 tools!

### Works great alongside cdp-tools

This server is designed to **complement** the existing [cdp-tools](https://www.npmjs.com/package/cdp-tools) MCP server. Use cdp-tools for navigation, clicking, screenshots, and breakpoints. Use cdp-extended for the 5 domains cdp-tools doesn't cover.

## Use Cases

- **API Mocking**: Intercept fetch requests and return mock data — no backend needed
- **Mobile Testing**: Emulate any device with one command
- **A11y Auditing**: Find missing labels, alt text, and ARIA issues automatically
- **Performance Profiling**: Get Core Web Vitals, CPU hotspots, and memory leaks
- **CSS Debugging**: See exactly which rules apply, find unused CSS, check font rendering
- **i18n Testing**: Switch timezone, locale, and language without system changes
- **Vision Accessibility**: Test how your site looks with color blindness

## License

MIT
