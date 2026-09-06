# toolbuilder CLI

Run locally from the repo root:

```bash
npm run cli -- health
npm run cli -- brand ingest --site-url https://stripe.com
npm run cli -- brand validate --site-url https://stripe.com --profile-file tests/fixtures/brand-profile.json
npm run cli -- tools list
npm run cli -- tools generate --prompt "BMI calculator" --project-name "BMI Calculator" --site-url https://gymshark.com
npm run cli -- tools rollback <tool-id> --version 1
npm run cli -- tools show generate_tool
npm run cli -- tools call generate_tool --json '{"prompt":"BMI calculator"}'
```

The CLI targets `http://localhost:3000` by default. Override with either:

- `TOOLBUILDER_API_URL=https://example.com`
- `--url https://example.com`

Sample MCP client config snippet (do **not** replace this repo's existing `.mcp.json`):

```json
{
  "mcpServers": {
    "toolbuilder": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```
