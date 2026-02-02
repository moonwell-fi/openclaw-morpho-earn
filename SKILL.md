---
name: morpho-yield
description: Earn yield on USDC by supplying to the Moonwell Flagship USDC vault on Morpho (Base). Use when depositing USDC, withdrawing from the vault, checking position/APY, or setting up wallet credentials for DeFi yield.
version: 1.1.0
metadata: {"clawdbot":{"emoji":"🌜🌛","category":"defi","requires":{"bins":["node"]}}}
---

# Morpho Yield — Earn safe yield on your USDC

Earn yield on USDC via the Moonwell Flagship USDC vault on Base (Morpho protocol).

**Vault:** `0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca`
**Chain:** Base (8453)
**Asset:** USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

## Quick Start

```bash
cd ~/clawd/skills/morpho-yield/scripts
npm install
npx tsx setup.ts
```

The setup wizard will:
1. Configure your wallet (private key file, env var, or 1Password)
2. Ask your notification preferences (daily/weekly reports)
3. Set compound threshold and auto-compound preference
4. Add monitoring to HEARTBEAT.md automatically

## Commands

### Interactive Setup

```bash
npx tsx setup.ts
```

Guides you through wallet configuration and preferences.

### Check Position & APY

```bash
npx tsx status.ts
```

Returns: current deposit, vault shares, APY, wallet balances.

### Generate Report

```bash
# Telegram/Discord format (default)
npx tsx report.ts

# JSON format (for automation)
npx tsx report.ts --json

# Plain text
npx tsx report.ts --plain
```

Beautiful formatted report showing position, rewards, and estimated earnings.

### Deposit USDC

```bash
npx tsx deposit.ts <amount>
# Example: deposit 100 USDC
npx tsx deposit.ts 100
```

Deposits USDC into the Moonwell vault. Requires sufficient USDC balance and gas (ETH on Base).

### Withdraw

```bash
# Withdraw specific amount of USDC
npx tsx withdraw.ts <amount>

# Withdraw all (redeem all shares)
npx tsx withdraw.ts all
```

### Check Rewards

```bash
npx tsx rewards.ts
```

Returns: claimable MORPHO, WELL, and other reward tokens from Merkl.

### Claim Rewards

```bash
npx tsx rewards.ts claim
```

Claims all pending rewards from Merkl distributor to your wallet.

### Auto-Compound

```bash
npx tsx compound.ts
```

All-in-one command that:
1. Claims any pending rewards from Merkl
2. Swaps reward tokens (MORPHO, WELL) to USDC via Odos aggregator
3. Deposits the USDC back into the vault

## Heartbeat Integration

After setup, your agent monitors the position based on deposit size:

| Deposit Size | Compound Check | Rationale |
|--------------|----------------|-----------|
| $10,000+ | Daily | Large positions accumulate meaningful rewards quickly |
| $1,000-$10,000 | Every 3 days | Balance between gas costs and reward accumulation |
| $100-$1,000 | Weekly | Small rewards need time to exceed gas costs |
| <$100 | Bi-weekly | Minimal positions, compound only when worthwhile |

The agent will:
- Check reward balances at the appropriate frequency
- Compound when rewards exceed your threshold (default: $0.50)
- Send position reports (daily/weekly based on preference)
- Alert you if gas is running low

## Configuration

Config location: `~/.config/morpho-yield/config.json`

```json
{
  "wallet": {
    "source": "file",
    "path": "~/.clawd/vault/morpho.key"
  },
  "rpc": "https://rpc.moonwell.fi/main/evm/8453"
}
```

Preferences: `~/.config/morpho-yield/preferences.json`

```json
{
  "reportFrequency": "weekly",
  "compoundThreshold": 0.50,
  "autoCompound": true
}
```

## Security

- Private keys are loaded at runtime from your chosen source
- Keys never logged or written to disk by scripts
- All transactions require explicit execution
- Scripts show transaction preview before sending

## Rewards

The Moonwell vault earns additional rewards beyond base APY:
- **MORPHO** — Morpho protocol incentives (~1.5% APR)
- **WELL** — Moonwell governance token (~2% APR)

Rewards are distributed via Merkl (updates every ~8 hours). The compound script handles claiming and reinvesting automatically.

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| Insufficient USDC | Not enough USDC in wallet | Bridge/transfer more USDC to Base |
| Insufficient gas | Not enough ETH for tx | Add ETH to wallet on Base |
| Wallet not configured | Missing config | Run `npx tsx setup.ts` |
| RPC error | Network issues | Check RPC URL or try again |
| Swap reverted | Gas underestimate | Script auto-adds 50% buffer |

## Dependencies

Scripts require Node.js 18+. Install deps before first run:

```bash
cd scripts && npm install
```

Packages used:
- `viem` — Ethereum interaction
- `tsx` — TypeScript execution
