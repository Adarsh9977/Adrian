# Adrian TypeScript SDK

Monorepo for the Adrian TypeScript SDK. The core package owns the event pipeline: event pairing, PII redaction, JSONL logging, WebSocket streaming, policy verdicts, and shared capture helpers.

## Packages

| Package | npm name | Install | Import |
|---|---|---|---|
| Core | `@secureagentics/adrian` | `npm install @secureagentics/adrian` | `import { init, shutdown } from "@secureagentics/adrian"` |

See [`packages/core/README.md`](packages/core/README.md) for usage, environment variables, and manual callback wiring.

## Development

From this directory:

```sh
npm install
npm run build
npm test
```
