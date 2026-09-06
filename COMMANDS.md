# Command reference: REST API, MCP, and CLI

MCP/API/CLI parity in this repo means the same seven customer-facing capabilities are exposed consistently across all three surfaces: the existing REST endpoints, the `/api/mcp` JSON-RPC tool registry, and the repo-local CLI that calls MCP. The REST routes and MCP tools share the same underlying surface/domain logic, and the CLI is a thin MCP client, so command names, payloads, and result shapes stay aligned instead of drifting.

## Pointing each surface at a different host

- **REST:** set a base URL such as `http://localhost:3000` or `https://your-deployed-origin`, then call the documented `/api/...` route on that host.
- **MCP:** use `GET $BASE_URL/api/mcp` for discovery and `POST $BASE_URL/api/mcp` for JSON-RPC tool calls.
- **CLI:** the repo-local command defaults to `http://localhost:3000`. Override it with either `TOOLBUILDER_API_URL=https://your-deployed-origin` or the global `--url https://your-deployed-origin` flag.
- **Important:** `--url` is a top-level CLI flag, so it must appear before `health`, `brand`, or `tools`.

For CLI-specific detail, see [`cli/README.md`](./cli/README.md). This file is the cross-surface index.

## Capability map

| Capability     | REST                            | MCP tool                  | CLI from repo root                                                                                          |
| -------------- | ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Health         | `GET /api/health`               | `get_health`              | `npm run cli -- health`                                                                                     |
| Brand ingest   | `POST /api/brand/ingest`        | `ingest_brand_context`    | `npm run cli -- brand ingest --site-url <url>`                                                              |
| Brand validate | `POST /api/brand/validate`      | `validate_brand_fidelity` | `npm run cli -- brand validate --site-url <url> (--profile-file <path> \| --stdin)`                         |
| Tools list     | `GET /api/tools`                | `list_generated_tools`    | `npm run cli -- tools list`                                                                                 |
| Tools get      | `GET /api/tools/{id}`           | `get_generated_tool`      | `npm run cli -- tools get <id>`                                                                             |
| Tools generate | `POST /api/tools/generate`      | `generate_tool`           | `npm run cli -- tools generate --prompt <text> [--project-name <name>] [--site-url <url>] [--tool-id <id>]` |
| Tool logic invoke | `POST /api/tools/{id}/logic/invoke` | — | — |
| Tools rollback | `POST /api/tools/{id}/rollback` | `rollback_generated_tool` | `npm run cli -- tools rollback <id> --version <n>`                                                          |

> If you install or link the root `toolbuilder` bin, the same commands also work as `toolbuilder ...`. This doc uses `npm run cli -- ...` because that is how the repo currently documents local usage.

> Logic-capable tools now store sandbox metadata and expose `POST /api/tools/{id}/logic/invoke` as the per-tool server-side execution route. The original prototype route `POST /api/tools/logic-demo/invoke` remains available as the fixed loan-calculator sandbox demo.

## MCP discovery

The MCP registry lives at `/api/mcp`. There are two primary discovery paths:

### `GET /api/mcp`

```bash
BASE_URL=http://localhost:3000

curl -sS "$BASE_URL/api/mcp"
```

Example response shape:

```json
{
	"name": "letterstory-toolbuilder",
	"version": "0.1.0",
	"protocol": "json-rpc-2.0",
	"endpoint": "http://localhost:3000/api/mcp",
	"tools": [
		{
			"name": "get_health",
			"description": "Return the current toolbuilder health and platform scaffold status payload.",
			"capability": "health.read",
			"rateLimit": null,
			"inputSchema": {
				"type": "object",
				"properties": {}
			},
			"outputSchema": {
				"type": "object",
				"properties": {
					"ok": {
						"const": true
					}
				}
			}
		}
	]
}
```

### JSON-RPC `tools/list`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 1,
	"result": {
		"tools": [
			{
				"name": "get_health",
				"description": "Return the current toolbuilder health and platform scaffold status payload.",
				"capability": "health.read",
				"rateLimit": null,
				"inputSchema": {
					"type": "object",
					"properties": {}
				},
				"outputSchema": {
					"type": "object",
					"properties": {
						"ok": {
							"const": true
						}
					}
				}
			},
			{
				"name": "generate_tool",
				"description": "Generate or revise a branded tool using the existing orchestration pipeline.",
				"capability": "tools.generate",
				"rateLimit": {
					"bucket": "tools.generate",
					"max": 10,
					"windowSeconds": 600
				}
			}
		]
	}
}
```

### CLI helpers for registry discovery

These are not customer capability calls; they are CLI helpers over the MCP registry:

```bash
npm run cli -- tools list --registry
npm run cli -- tools show generate_tool
```

Generic MCP passthrough from the CLI:

```bash
npm run cli -- tools call generate_tool --json '{"prompt":"BMI calculator"}'
printf '%s\n' '{"siteUrl":"https://stripe.com"}' | npm run cli -- tools call ingest_brand_context --stdin
```

## 1. Health

### REST

- **Method + path:** `GET /api/health`

```bash
BASE_URL=http://localhost:3000

curl -sS "$BASE_URL/api/health"
```

Example response shape:

```json
{
	"ok": true,
	"service": "letterstory-toolbuilder",
	"status": {
		"modules": [
			{
				"name": "Brand ingestion",
				"state": "configured",
				"summary": "Context.dev-backed brand extraction is live behind env gating, with URL safety checks and a probe script for real-site validation.",
				"nextSteps": [
					"Run the live ingestion probe against representative customer sites.",
					"Add follow-up validation for tone, imagery, and layout fidelity.",
					"Feed the validated profile into tool generation and spot-check embed quality."
				]
			},
			{
				"name": "Tool generation",
				"state": "stubbed",
				"summary": "The orchestration boundary is in place for prompt-driven tool builds, without any live agent wiring yet.",
				"nextSteps": [
					"Define the generation job contract.",
					"Attach coding-agent execution flow.",
					"Store manifests and preview metadata."
				]
			}
		]
	}
}
```

### MCP

- **Tool name:** `get_health`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_health",
      "arguments": {}
    }
  }'
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 2,
	"result": {
		"name": "get_health",
		"output": {
			"ok": true,
			"service": "letterstory-toolbuilder",
			"status": {
				"modules": [
					{
						"name": "Brand ingestion",
						"state": "configured"
					}
				]
			}
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command:** `npm run cli -- health`
- **With host override:** `npm run cli -- --url https://your-deployed-origin health`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- health`

## 2. Brand ingest

### REST

- **Method + path:** `POST /api/brand/ingest`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/brand/ingest" \
  -H "Content-Type: application/json" \
  --data '{
    "siteUrl": "https://stripe.com"
  }'
```

Example response shape:

```json
{
	"status": "success",
	"requestedUrl": "https://stripe.com",
	"profile": {
		"url": "https://stripe.com",
		"source": "context.dev",
		"brandName": "Stripe",
		"colorScheme": "light",
		"confidence": 0.93,
		"primaryLogoUrl": "https://stripe.com/logo.svg",
		"logoUrls": ["https://stripe.com/logo.svg"],
		"colors": {
			"primary": "#635BFF",
			"surface": "#F6F9FC",
			"text": "#0A2540"
		},
		"fonts": ["Inter"],
		"typography": {
			"primaryFont": "Inter",
			"headingFont": "Inter",
			"bodyFont": "Inter"
		},
		"images": {
			"logo": {
				"url": "https://stripe.com/logo.svg",
				"kind": "url",
				"type": "logo"
			}
		},
		"metadata": {
			"capturedAt": "2026-09-05T11:00:00.000Z"
		},
		"raw": {
			"sourcePages": ["https://stripe.com"]
		}
	}
}
```

### MCP

- **Tool name:** `ingest_brand_context`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "ingest_brand_context",
      "arguments": {
        "siteUrl": "https://stripe.com"
      }
    }
  }'
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 3,
	"result": {
		"name": "ingest_brand_context",
		"output": {
			"status": "success",
			"requestedUrl": "https://stripe.com",
			"profile": {
				"brandName": "Stripe",
				"colors": {
					"primary": "#635BFF"
				}
			}
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command:** `npm run cli -- brand ingest --site-url https://stripe.com`
- **With host override:** `npm run cli -- --url https://your-deployed-origin brand ingest --site-url https://stripe.com`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- brand ingest --site-url https://stripe.com`

## 3. Brand validate

### REST

- **Method + path:** `POST /api/brand/validate`

Example `curl` with a realistic profile payload. The nested `profile` object below follows the current `brandProfileSchema` contract from `src/lib/contracts/brand.ts`:

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/brand/validate" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "siteUrl": "https://stripe.com",
  "profile": {
    "url": "https://stripe.com",
    "source": "context.dev",
    "brandName": "Stripe",
    "colorScheme": "light",
    "confidence": 0.93,
    "primaryLogoUrl": "https://stripe.com/logo.svg",
    "logoUrls": [
      "https://stripe.com/logo.svg"
    ],
    "colors": {
      "primary": "#635BFF",
      "surface": "#F6F9FC",
      "text": "#0A2540"
    },
    "fonts": [
      "Inter"
    ],
    "typography": {
      "primaryFont": "Inter",
      "secondaryFont": null,
      "headingFont": "Inter",
      "bodyFont": "Inter",
      "fontFamilies": [
        "Inter"
      ],
      "fontFaces": [
        {
          "family": "Inter",
          "google": true,
          "category": "sans-serif",
          "files": {
            "regular": "https://fonts.gstatic.com/s/inter/v18/inter.woff2"
          },
          "fallbacks": [
            "system-ui",
            "sans-serif"
          ]
        }
      ],
      "headingFontFace": {
        "family": "Inter",
        "google": true,
        "category": "sans-serif",
        "files": {
          "regular": "https://fonts.gstatic.com/s/inter/v18/inter.woff2"
        },
        "fallbacks": [
          "system-ui",
          "sans-serif"
        ]
      },
      "bodyFontFace": {
        "family": "Inter",
        "google": true,
        "category": "sans-serif",
        "files": {
          "regular": "https://fonts.gstatic.com/s/inter/v18/inter.woff2"
        },
        "fallbacks": [
          "system-ui",
          "sans-serif"
        ]
      },
      "fontStacks": {
        "heading": [
          "Inter",
          "system-ui",
          "sans-serif"
        ],
        "body": [
          "Inter",
          "system-ui",
          "sans-serif"
        ]
      },
      "scale": {
        "h1": "56px",
        "h2": "40px",
        "h3": "32px",
        "body": "16px",
        "small": "14px"
      },
      "hierarchy": "balanced"
    },
    "spacing": {
      "baseUnit": 8,
      "borderRadius": "16px",
      "radiusScale": [
        "8px",
        "12px",
        "16px",
        "24px"
      ],
      "rhythm": "balanced"
    },
    "components": {
      "primaryButton": {
        "background": "#635BFF",
        "textColor": "#FFFFFF",
        "borderColor": "#635BFF",
        "borderRadius": "9999px",
        "shadow": "0 8px 24px rgba(99,91,255,0.24)"
      },
      "secondaryButton": {
        "background": "#FFFFFF",
        "textColor": "#0A2540",
        "borderColor": "#C1C9D2",
        "borderRadius": "9999px",
        "shadow": "none"
      },
      "input": {
        "background": "#FFFFFF",
        "textColor": "#0A2540",
        "borderColor": "#C1C9D2",
        "borderRadius": "12px",
        "shadow": "0 1px 2px rgba(10,37,64,0.08)"
      },
      "additional": {}
    },
    "images": {
      "logo": {
        "url": "https://stripe.com/logo.svg",
        "kind": "url",
        "mode": "light",
        "type": "logo",
        "width": 512,
        "height": 128,
        "colors": [
          "#635BFF",
          "#0A2540"
        ],
        "alt": "Stripe",
        "href": "https://stripe.com",
        "selectionReasoning": "Primary wordmark from the global header.",
        "selectionConfidence": 0.95,
        "canonicalDataUri": null,
        "canonicalSourceUrl": "https://stripe.com/logo.svg",
        "canonicalWarnings": []
      },
      "logoVariants": [
        {
          "url": "https://stripe.com/logo.svg",
          "kind": "url",
          "mode": "light",
          "type": "logo",
          "width": 512,
          "height": 128,
          "colors": [
            "#635BFF",
            "#0A2540"
          ]
        }
      ],
      "faviconUrl": "https://stripe.com/favicon.ico",
      "ogImageUrl": "https://stripe.com/og.png",
      "gallery": [
        "https://stripe.com/screenshot-1.png"
      ],
      "imageryStyle": "clean product illustrations with subtle gradients",
      "notes": [
        "Rounded controls with generous whitespace."
      ]
    },
    "personality": {
      "tone": "clear, confident, developer-friendly",
      "toneOfVoice": "direct and polished",
      "energy": "medium",
      "targetAudience": "internet businesses and developers",
      "descriptors": [
        "modern",
        "trustworthy",
        "technical"
      ],
      "notableSignals": [
        "Concise product copy",
        "High-contrast CTAs"
      ]
    },
    "designSystem": {
      "framework": "custom",
      "componentLibrary": "custom",
      "implementationStyle": "hybrid",
      "notes": [
        "Token-driven spacing and color usage."
      ]
    },
    "metadata": {
      "capturedAt": "2026-09-05T11:00:00.000Z"
    },
    "raw": {
      "sourcePages": [
        "https://stripe.com"
      ]
    }
  }
}
JSON
```

Example response shape:

```json
{
	"status": "success",
	"requestedUrl": "https://stripe.com",
	"assessment": {
		"status": "warn",
		"similarityScore": 72,
		"confidence": "high",
		"summary": "The profile matches Stripe's typography and color direction, with minor CTA treatment differences.",
		"confirmedSignals": [
			"Inter-driven sans-serif typography",
			"Purple primary accent",
			"Generous whitespace"
		],
		"gaps": [
			{
				"field": "components",
				"severity": "medium",
				"issue": "Secondary controls are slightly flatter than the live reference.",
				"evidence": "Reference buttons use more visible borders and subtle shadows.",
				"recommendation": "Increase border contrast and restore the softer elevation treatment."
			}
		],
		"derivedSignals": {
			"toneOfVoice": "direct and polished",
			"imageryStyle": "clean product illustrations with subtle gradients",
			"typeHierarchy": "balanced",
			"spacingRhythm": "balanced",
			"distinctiveTraits": ["rounded pill CTAs", "high-contrast dark text on pale surfaces"]
		}
	},
	"referenceUrl": "https://stripe.com",
	"model": "claude-sonnet-4-6",
	"enrichedProfile": {
		"brandName": "Stripe",
		"colors": {
			"primary": "#635BFF"
		}
	}
}
```

### MCP

- **Tool name:** `validate_brand_fidelity`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "validate_brand_fidelity",
    "arguments": {
      "siteUrl": "https://stripe.com",
      "profile": {
        "url": "https://stripe.com",
        "source": "context.dev",
        "brandName": "Stripe",
        "colorScheme": "light",
        "confidence": 0.93,
        "primaryLogoUrl": "https://stripe.com/logo.svg",
        "logoUrls": [
          "https://stripe.com/logo.svg"
        ],
        "colors": {
          "primary": "#635BFF",
          "surface": "#F6F9FC",
          "text": "#0A2540"
        },
        "fonts": [
          "Inter"
        ],
        "typography": {
          "primaryFont": "Inter",
          "secondaryFont": null,
          "headingFont": "Inter",
          "bodyFont": "Inter",
          "fontFamilies": [
            "Inter"
          ],
          "fontFaces": [
            {
              "family": "Inter",
              "google": true,
              "category": "sans-serif",
              "files": {
                "regular": "https://fonts.gstatic.com/s/inter/v18/inter.woff2"
              },
              "fallbacks": [
                "system-ui",
                "sans-serif"
              ]
            }
          ],
          "headingFontFace": {
            "family": "Inter",
            "google": true,
            "category": "sans-serif",
            "files": {
              "regular": "https://fonts.gstatic.com/s/inter/v18/inter.woff2"
            },
            "fallbacks": [
              "system-ui",
              "sans-serif"
            ]
          },
          "bodyFontFace": {
            "family": "Inter",
            "google": true,
            "category": "sans-serif",
            "files": {
              "regular": "https://fonts.gstatic.com/s/inter/v18/inter.woff2"
            },
            "fallbacks": [
              "system-ui",
              "sans-serif"
            ]
          },
          "fontStacks": {
            "heading": [
              "Inter",
              "system-ui",
              "sans-serif"
            ],
            "body": [
              "Inter",
              "system-ui",
              "sans-serif"
            ]
          },
          "scale": {
            "h1": "56px",
            "h2": "40px",
            "h3": "32px",
            "body": "16px",
            "small": "14px"
          },
          "hierarchy": "balanced"
        },
        "spacing": {
          "baseUnit": 8,
          "borderRadius": "16px",
          "radiusScale": [
            "8px",
            "12px",
            "16px",
            "24px"
          ],
          "rhythm": "balanced"
        },
        "components": {
          "primaryButton": {
            "background": "#635BFF",
            "textColor": "#FFFFFF",
            "borderColor": "#635BFF",
            "borderRadius": "9999px",
            "shadow": "0 8px 24px rgba(99,91,255,0.24)"
          },
          "secondaryButton": {
            "background": "#FFFFFF",
            "textColor": "#0A2540",
            "borderColor": "#C1C9D2",
            "borderRadius": "9999px",
            "shadow": "none"
          },
          "input": {
            "background": "#FFFFFF",
            "textColor": "#0A2540",
            "borderColor": "#C1C9D2",
            "borderRadius": "12px",
            "shadow": "0 1px 2px rgba(10,37,64,0.08)"
          },
          "additional": {}
        },
        "images": {
          "logo": {
            "url": "https://stripe.com/logo.svg",
            "kind": "url",
            "mode": "light",
            "type": "logo",
            "width": 512,
            "height": 128,
            "colors": [
              "#635BFF",
              "#0A2540"
            ],
            "alt": "Stripe",
            "href": "https://stripe.com",
            "selectionReasoning": "Primary wordmark from the global header.",
            "selectionConfidence": 0.95,
            "canonicalDataUri": null,
            "canonicalSourceUrl": "https://stripe.com/logo.svg",
            "canonicalWarnings": []
          },
          "logoVariants": [
            {
              "url": "https://stripe.com/logo.svg",
              "kind": "url",
              "mode": "light",
              "type": "logo",
              "width": 512,
              "height": 128,
              "colors": [
                "#635BFF",
                "#0A2540"
              ]
            }
          ],
          "faviconUrl": "https://stripe.com/favicon.ico",
          "ogImageUrl": "https://stripe.com/og.png",
          "gallery": [
            "https://stripe.com/screenshot-1.png"
          ],
          "imageryStyle": "clean product illustrations with subtle gradients",
          "notes": [
            "Rounded controls with generous whitespace."
          ]
        },
        "personality": {
          "tone": "clear, confident, developer-friendly",
          "toneOfVoice": "direct and polished",
          "energy": "medium",
          "targetAudience": "internet businesses and developers",
          "descriptors": [
            "modern",
            "trustworthy",
            "technical"
          ],
          "notableSignals": [
            "Concise product copy",
            "High-contrast CTAs"
          ]
        },
        "designSystem": {
          "framework": "custom",
          "componentLibrary": "custom",
          "implementationStyle": "hybrid",
          "notes": [
            "Token-driven spacing and color usage."
          ]
        },
        "metadata": {
          "capturedAt": "2026-09-05T11:00:00.000Z"
        },
        "raw": {
          "sourcePages": [
            "https://stripe.com"
          ]
        }
      }
    }
  }
}
JSON
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 4,
	"result": {
		"name": "validate_brand_fidelity",
		"output": {
			"status": "success",
			"requestedUrl": "https://stripe.com",
			"assessment": {
				"status": "warn",
				"similarityScore": 72,
				"confidence": "high"
			},
			"referenceUrl": "https://stripe.com",
			"model": "claude-sonnet-4-6"
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command with file input:** `npm run cli -- brand validate --site-url https://stripe.com --profile-file tests/fixtures/brand-profile.json`
- **Command with stdin:** `cat tests/fixtures/brand-profile.json | npm run cli -- brand validate --site-url https://stripe.com --stdin`
- **With host override:** `npm run cli -- --url https://your-deployed-origin brand validate --site-url https://stripe.com --profile-file tests/fixtures/brand-profile.json`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- brand validate --site-url https://stripe.com --profile-file tests/fixtures/brand-profile.json`

## 4. Tools list

### REST

- **Method + path:** `GET /api/tools`

```bash
BASE_URL=http://localhost:3000

curl -sS "$BASE_URL/api/tools"
```

Example response shape:

```json
{
	"status": "success",
	"tools": [
		{
			"id": "bmi-calculator",
			"projectName": "BMI Calculator",
			"prompt": "Build a branded BMI calculator for gym members.",
			"siteUrl": "https://gymshark.com",
			"brandSnapshot": {
				"brandName": "Gymshark",
				"colors": {
					"primary": "#111111",
					"accent": "#FFFFFF"
				},
				"fonts": ["Montserrat"],
				"logoDataUri": "data:image/svg+xml;base64,..."
			},
			"copy": {
				"headline": "Check your BMI",
				"supportingCopy": "A simple estimate for members planning their next fitness goal."
			},
			"brandFidelity": {
				"verdict": "pass",
				"notes": "Typography and palette stay aligned with the supplied brand snapshot."
			},
			"model": "claude-sonnet-4-6",
			"warnings": [],
			"createdAt": "2026-09-05T10:30:00.000Z",
			"updatedAt": "2026-09-05T10:31:12.000Z",
			"version": 2,
			"previousVersionCount": 1
		}
	]
}
```

`GET /api/tools` intentionally omits the current `html` body, the `history` array, and `embedSnippet` to keep list responses small. Fetch detail or generate responses when you need the paste-ready embed code.

### MCP

- **Tool name:** `list_generated_tools`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "list_generated_tools",
      "arguments": {}
    }
  }'
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 5,
	"result": {
		"name": "list_generated_tools",
		"output": {
			"status": "success",
			"tools": [
				{
					"id": "bmi-calculator",
					"projectName": "BMI Calculator",
					"version": 2,
					"previousVersionCount": 1
				}
			]
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command:** `npm run cli -- tools list`
- **With host override:** `npm run cli -- --url https://your-deployed-origin tools list`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- tools list`

## 5. Tools get

### REST

- **Method + path:** `GET /api/tools/{id}`

```bash
BASE_URL=http://localhost:3000

curl -sS "$BASE_URL/api/tools/bmi-calculator"
```

Example response shape:

```json
{
	"status": "success",
	"tool": {
		"id": "bmi-calculator",
		"projectName": "BMI Calculator",
		"prompt": "Build a branded BMI calculator for gym members.",
		"siteUrl": "https://gymshark.com",
		"brandSnapshot": {
			"brandName": "Gymshark",
			"colors": {
				"primary": "#111111"
			}
		},
		"copy": {
			"headline": "Check your BMI",
			"supportingCopy": "A simple estimate for members planning their next fitness goal."
		},
		"brandFidelity": {
			"verdict": "pass",
			"notes": "Typography and palette stay aligned with the supplied brand snapshot."
		},
		"embedSnippet": "<iframe id=\"letterstory-tool-bmi-calculator\" src=\"http://localhost:3000/t/bmi-calculator\" ...></iframe>\n<script>(function(){ ... })();</script>",
		"model": "claude-sonnet-4-6",
		"warnings": [],
		"createdAt": "2026-09-05T10:30:00.000Z",
		"updatedAt": "2026-09-05T10:31:12.000Z",
		"version": 2,
		"history": [
			{
				"version": 1,
				"createdAt": "2026-09-05T10:30:00.000Z",
				"projectName": "BMI Calculator",
				"prompt": "Build a branded BMI calculator for gym members.",
				"siteUrl": "https://gymshark.com",
				"brandSnapshot": {
					"brandName": "Gymshark"
				},
				"copy": {
					"headline": "Check your BMI",
					"supportingCopy": "A simple estimate for members planning their next fitness goal."
				},
				"brandFidelity": {
					"verdict": "warn",
					"notes": "Initial version used slightly more generic spacing."
				},
				"model": "claude-sonnet-4-6",
				"warnings": []
			}
		]
	}
}
```

`GET /api/tools/{id}` intentionally strips `html` from both the current record and every history entry, but now includes `embedSnippet` as the exact paste-ready iframe + resize-listener snippet for that tool.

### MCP

- **Tool name:** `get_generated_tool`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "get_generated_tool",
      "arguments": {
        "id": "bmi-calculator"
      }
    }
  }'
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 6,
	"result": {
		"name": "get_generated_tool",
		"output": {
			"status": "success",
			"tool": {
				"id": "bmi-calculator",
				"embedSnippet": "<iframe id=\"letterstory-tool-bmi-calculator\" src=\"http://localhost:3000/t/bmi-calculator\" ...></iframe>\n<script>(function(){ ... })();</script>",
				"version": 2,
				"history": [
					{
						"version": 1
					}
				]
			}
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command:** `npm run cli -- tools get bmi-calculator`
- **With host override:** `npm run cli -- --url https://your-deployed-origin tools get bmi-calculator`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- tools get bmi-calculator`
- **Output note:** in addition to the JSON response on stdout, the CLI prints a labeled `Embed snippet:` block to stderr for `tools get`.

## 6. Tools generate

### REST

- **Method + path:** `POST /api/tools/generate`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/tools/generate" \
  -H "Content-Type: application/json" \
  --data '{
    "projectName": "BMI Calculator",
    "siteUrl": "https://gymshark.com",
    "prompt": "Build a branded BMI calculator for gym members."
  }'
```

Example response shape:

```json
{
	"status": "success",
	"tool": {
		"id": "bmi-calculator",
		"projectName": "BMI Calculator",
		"prompt": "Build a branded BMI calculator for gym members.",
		"siteUrl": "https://gymshark.com",
		"brandSnapshot": {
			"brandName": "Gymshark",
			"colors": {
				"primary": "#111111",
				"accent": "#FFFFFF"
			},
			"fonts": ["Montserrat"],
			"headingFont": "Montserrat",
			"bodyFont": "Montserrat",
			"logoDataUri": "data:image/svg+xml;base64,..."
		},
		"html": "<!doctype html><html><body>...</body></html>",
		"copy": {
			"headline": "Check your BMI",
			"supportingCopy": "A simple estimate for members planning their next fitness goal."
		},
		"brandFidelity": {
			"verdict": "pass",
			"notes": "Typography and palette stay aligned with the supplied brand snapshot."
		},
		"embedSnippet": "<iframe id=\"letterstory-tool-bmi-calculator\" src=\"http://localhost:3000/t/bmi-calculator\" ...></iframe>\n<script>(function(){ ... })();</script>",
		"model": "claude-sonnet-4-6",
		"warnings": [],
		"createdAt": "2026-09-05T10:30:00.000Z",
		"version": 2,
		"updatedAt": "2026-09-05T10:31:12.000Z",
		"history": [
			{
				"projectName": "BMI Calculator",
				"prompt": "Build a branded BMI calculator for gym members.",
				"siteUrl": "https://gymshark.com",
				"brandSnapshot": {
					"brandName": "Gymshark"
				},
				"html": "<!doctype html><html><body>...</body></html>",
				"copy": {
					"headline": "Check your BMI",
					"supportingCopy": "A simple estimate for members planning their next fitness goal."
				},
				"brandFidelity": {
					"verdict": "warn",
					"notes": "Initial version used slightly more generic spacing."
				},
				"model": "claude-sonnet-4-6",
				"warnings": [],
				"version": 1,
				"createdAt": "2026-09-05T10:30:00.000Z"
			}
		]
	}
}
```

Add `"toolId": "bmi-calculator"` to the request body to revise an existing tool in place. The returned `embedSnippet` is the exact paste-ready iframe + resize-listener snippet for the generated tool.

When the generation-time classifier decides the prompt needs server-side logic, the response now also includes `tool.logic` metadata (invoke path, snapshot id, warm sandbox name, generated contract, validation timestamps). The generated HTML is instructed to call the stored invoke route instead of reproducing that business logic client-side. If logic generation or validation fails, generation still succeeds with a normal static/client-side tool and a warning explains the fallback.

### MCP

- **Tool name:** `generate_tool`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 7,
    "method": "tools/call",
    "params": {
      "name": "generate_tool",
      "arguments": {
        "projectName": "BMI Calculator",
        "siteUrl": "https://gymshark.com",
        "prompt": "Build a branded BMI calculator for gym members."
      }
    }
  }'
```

Example response shape:

```json
{
	"jsonrpc": "2.0",
	"id": 7,
	"result": {
		"name": "generate_tool",
		"output": {
			"status": "success",
			"tool": {
				"id": "bmi-calculator",
				"embedSnippet": "<iframe id=\"letterstory-tool-bmi-calculator\" src=\"http://localhost:3000/t/bmi-calculator\" ...></iframe>\n<script>(function(){ ... })();</script>",
				"html": "<!doctype html><html><body>...</body></html>",
				"version": 2
			}
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command:** `npm run cli -- tools generate --prompt "BMI calculator" [--project-name "BMI Calculator"] [--site-url https://gymshark.com] [--tool-id bmi-calculator]`
- **With host override:** `npm run cli -- --url https://your-deployed-origin tools generate --prompt "BMI calculator" --project-name "BMI Calculator" --site-url https://gymshark.com`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- tools generate --prompt "BMI calculator" --project-name "BMI Calculator" --site-url https://gymshark.com`
- **Output note:** in addition to the JSON response on stdout, the CLI prints a labeled `Embed snippet:` block to stderr for `tools generate`.

## 7. Tool logic invoke

### REST

- **Method + path:** `POST /api/tools/{id}/logic/invoke`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/tools/<tool-id>/logic/invoke" \
  -H "Content-Type: application/json" \
  --data '{
    "filingStatus": "single",
    "taxableIncome": 90000
  }'
```

Example response shape:

```json
{
  "status": "success",
  "output": {
    "filingStatus": "single",
    "taxableIncome": 90000,
    "totalTax": 14853,
    "marginalRate": 0.22,
    "effectiveRate": 0.1650333333,
    "bracketBreakdown": [
      {
        "rate": 0.1,
        "bracketMin": 0,
        "bracketMax": 11600,
        "incomeInBracket": 11600,
        "taxInBracket": 1160
      }
    ]
  },
  "sandbox": {
    "sandboxName": "generated-tool-logic-...-warm-...",
    "snapshotId": "6205d5eb-da05-46ec-ac18-205aa5a7b45d"
  }
}
```

This route exists only for tools whose stored `tool.logic` metadata is present. Requests are validated against the tool's generated input contract before the warm sandbox is invoked, and the sandbox response is validated against the generated output contract before it is returned.

## 8. Tools rollback

### REST

- **Method + path:** `POST /api/tools/{id}/rollback`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/tools/bmi-calculator/rollback" \
  -H "Content-Type: application/json" \
  --data '{
    "version": 1
  }'
```

Example response:

```json
{
	"status": "success",
	"tool": {
		"id": "bmi-calculator",
		"projectName": "BMI Calculator",
		"prompt": "Build a branded BMI calculator for gym members.",
		"siteUrl": "https://gymshark.com",
		"html": "<!doctype html><html><body>...</body></html>",
		"copy": {
			"headline": "Check your BMI",
			"supportingCopy": "A simple estimate for members planning their next fitness goal."
		},
		"brandFidelity": {
			"verdict": "warn",
			"notes": "Rolled back to version 1."
		},
		"model": "claude-sonnet-4-6",
		"warnings": [],
		"createdAt": "2026-09-05T10:30:00.000Z",
		"updatedAt": "2026-09-05T10:35:00.000Z",
		"version": 3,
		"history": [
			{
				"version": 1,
				"createdAt": "2026-09-05T10:30:00.000Z",
				"projectName": "BMI Calculator",
				"prompt": "Build a branded BMI calculator for gym members.",
				"siteUrl": "https://gymshark.com",
				"html": "<!doctype html><html><body>...</body></html>",
				"copy": {
					"headline": "Check your BMI",
					"supportingCopy": "A simple estimate for members planning their next fitness goal."
				},
				"brandFidelity": {
					"verdict": "warn",
					"notes": "Initial version used slightly more generic spacing."
				},
				"model": "claude-sonnet-4-6",
				"warnings": [],
				"version": 1
			}
		]
	}
}
```

### MCP

- **Tool name:** `rollback_generated_tool`

```bash
BASE_URL=http://localhost:3000

curl -sS -X POST "$BASE_URL/api/mcp" \
  -H "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": 8,
    "method": "tools/call",
    "params": {
      "name": "rollback_generated_tool",
      "arguments": {
        "id": "bmi-calculator",
        "version": 1
      }
    }
  }'
```

Example response:

```json
{
	"jsonrpc": "2.0",
	"id": 8,
	"result": {
		"name": "rollback_generated_tool",
		"output": {
			"status": "success",
			"tool": {
				"id": "bmi-calculator",
				"version": 3
			}
		},
		"meta": {
			"httpStatus": 200,
			"headers": null
		}
	}
}
```

### CLI

- **Command:** `npm run cli -- tools rollback bmi-calculator --version 1`
- **With host override:** `npm run cli -- --url https://your-deployed-origin tools rollback bmi-calculator --version 1`
- **With env override:** `TOOLBUILDER_API_URL=https://your-deployed-origin npm run cli -- tools rollback bmi-calculator --version 1`

## Known limitations

- `/api/mcp` is currently unauthenticated and public, matching the v1 REST posture by design.
- Revision/rollback timeout behavior is under active investigation as of 2026-09-05.
