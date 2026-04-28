# Zombie Dance AI - VS Code Extension

Real-time AI agent integration with ZombieCoder server for VS Code.

## Features

- 🤖 Real-time WebSocket connection to Zombie Dance server
- �� Live AI agent chat interface
- 📝 Direct file editing capabilities
- 🎨 Modern UI matching VS Code theme
- 🔌 Auto-connect and reconnection support
- 📊 Server status monitoring

## Installation

1. Build the extension:
   ```bash
   npm install
   npm run compile
   npm run package
   ```

2. Install the `.vsix` file in VS Code:
   - Open VS Code
   - Go to Extensions → Install from VSIX...
   - Select the generated `zombie-dance-ai-1.0.0.vsix` file

## Configuration

Add these settings to your VS Code `settings.json`:

```json
{
  "zombie-dance.serverUrl": "http://localhost:8000",
  "zombie-dance.autoConnect": true,
  "zombie-dance.theme": "dark"
}
```

## Usage

1. Start your Zombie Dance server
2. Open VS Code
3. Use the command palette (Ctrl+Shift+P) and search for "Zombie Dance"
4. Click "Open Zombie Dance AI Panel"
5. Connect to your server and start chatting with AI agents!

## Commands

- `Zombie Dance: Open Zombie Dance AI Panel` - Open the main interface
- `Zombie Dance: Connect to Zombie Server` - Connect to server
- `Zombie Dance: Disconnect from Server` - Disconnect from server

## Requirements

- Node.js 16+
- Zombie Dance server running on localhost:8000
- VS Code 1.75+

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Package extension
npm run package
```

## License

MIT
