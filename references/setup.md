# Wallet Setup

Configure your wallet for the Morpho yield skill.

## Config File

Create `~/.config/morpho-yield/config.json`:

```json
{
  "wallet": {
    "source": "env",
    "env_var": "MORPHO_PRIVATE_KEY"
  },
  "rpc": "https://mainnet.base.org"
}
```

## Wallet Source Options

### Option 1: Environment Variable (Simple)

```json
{
  "wallet": {
    "source": "env",
    "env_var": "MORPHO_PRIVATE_KEY"
  }
}
```

Set in your shell:
```bash
export MORPHO_PRIVATE_KEY="0x..."
```

Or add to `~/.zshrc` / `~/.bashrc`.

### Option 2: 1Password (Recommended for Security)

```json
{
  "wallet": {
    "source": "1password",
    "item": "Morpho Bot Wallet",
    "field": "private_key"
  }
}
```

Create a 1Password item called "Morpho Bot Wallet" with a field "private_key" containing your key.

Scripts will use `op read` to fetch at runtime (requires 1Password CLI + desktop app).

### Option 3: Encrypted File

```json
{
  "wallet": {
    "source": "file",
    "path": "~/.clawd/vault/morpho.key",
    "encrypted": true
  }
}
```

For encrypted files, you'll be prompted for a password on first use.

## RPC Configuration

Default RPC is the public Base endpoint. For better reliability, use:

- **Alchemy:** `https://base-mainnet.g.alchemy.com/v2/YOUR_KEY`
- **Infura:** `https://base-mainnet.infura.io/v3/YOUR_KEY`
- **QuickNode:** Your QuickNode Base endpoint

```json
{
  "rpc": "https://base-mainnet.g.alchemy.com/v2/abc123"
}
```

## Creating a New Wallet

If you need a fresh wallet for this bot:

```bash
# Generate a new wallet (never share the output!)
node -e "const w = require('viem/accounts').generatePrivateKey(); console.log(w)"
```

Then:
1. Save the private key securely (1Password recommended)
2. Get the address: fund it with USDC + small ETH for gas on Base
3. Configure as above

## Funding Your Wallet

The wallet needs:
- **USDC on Base** — the asset to deposit
- **ETH on Base** — for gas (~0.001 ETH per transaction)

Bridge from Ethereum mainnet via:
- [Base Bridge](https://bridge.base.org)
- [Across Protocol](https://across.to)
- [Stargate](https://stargate.finance)

## Verify Setup

Run the status script to confirm everything works:

```bash
cd /path/to/morpho-yield/scripts
npx ts-node status.ts
```

Should show your wallet address, USDC balance, and current vault APY.
