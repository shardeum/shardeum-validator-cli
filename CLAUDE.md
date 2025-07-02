# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Install dependencies
npm ci

# Compile TypeScript
npm run compile

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run fix

# Format code
npm run format-fix

# Check formatting
npm run format-check
```

### Build & Release
```bash
# Clean build directory
npm run clean

# Prepare release (compiles)
npm run prepare

# Release commands (patches, minor, major)
npm run release:patch
npm run release:minor
npm run release:major

# Pre-release versions
npm run release:prerelease
npm run release:prepatch
npm run release:preminor
npm run release:premajor
```

### CLI Usage
```bash
# Start the validator node
operator-cli start

# Check node status
operator-cli status

# Stop the node
operator-cli stop

# Set GUI password
operator-cli gui set password <password>

# Start GUI
operator-cli gui start

# Check GUI status
operator-cli gui status
```

## Architecture

### Core Structure
The Shardeum Validator CLI is a TypeScript-based command-line tool for managing Shardeum validator nodes:

- **Entry Point**: `src/index.ts` - Sets up Commander.js CLI and registers commands
- **Command Modules**: 
  - `src/node-commands.ts` - Validator node operations (start/stop/status, staking, updates)
  - `src/gui-commands.ts` - Operator GUI management
- **Process Management**: Uses PM2 for managing validator and GUI processes
- **Configuration**: JSON-based configs with Ajv validation, supports custom config files

### Key Components

**Configuration System** (`src/config/`):
- `default-network-config.ts` - Network connection settings (archivers, IPs, ports)
- `default-node-config.ts` - Node operation parameters
- `config-utils.ts` - Configuration loading and validation logic

**Utilities** (`src/utils/`):
- `network-utils.ts` - Fetches network data from archivers
- `nodeUtils.ts` - Node data fetching and validation
- `queries.ts` - Robust query handling with retries
- `time.ts` - Time-based caching mechanisms
- `pm2.ts` - PM2 process management wrapper
- `logs.ts` - Winston-based logging

**Process Architecture**:
- Validator nodes run as PM2-managed processes
- GUI runs as separate PM2 process on configurable port
- Both processes have auto-restart capabilities
- Logs stored in `logs/` directory

### Testing
- Jest with TypeScript support via ts-jest
- Unit tests in `test/unit/`
- Coverage reporting enabled (thresholds currently low)
- Test individual files: `npm test -- test/unit/specific-test.ts`

### Security Considerations
- Argon2 for password hashing
- Ethereum cryptographic utilities
- ESLint security plugins configured
- Never commit secrets or keys

### Network Configuration
For local development, update `src/config/default-network-config.ts`:
- Set archiver IPs to `127.0.0.1`
- Use appropriate ports (default: 4000)
- Include correct public keys

For live networks:
- Update archiver details with live network values
- Recompile after changes: `npm run compile`

### Dependencies
Key libraries:
- `commander` - CLI framework
- `pm2` - Process management
- `ethers` & `ethereumjs-util` - Ethereum utilities
- `ajv` - JSON schema validation
- `winston` - Logging
- `axios` - HTTP requests
- `argon2` - Password hashing