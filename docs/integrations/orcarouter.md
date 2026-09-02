# OrcaRouter integration

Mission Console uses OrcaRouter through its OpenAI-compatible Chat Completions API.

## Configuration

In **Settings → Model configuration**, choose:

```yaml
provider: orcarouter
baseUrl: https://api.orcarouter.ai/v1
model: orcarouter/auto
apiKeyEnv: ORCAROUTER_API_KEY
```

`orcarouter/auto` enables OrcaRouter adaptive routing. A concrete model ID can be used when a workflow needs a fixed upstream model.

The API key is entered by the user at runtime and stored through Electron `safeStorage`; no key belongs in this repository. The same provider is available for named workflow model profiles.
