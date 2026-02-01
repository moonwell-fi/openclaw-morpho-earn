# 🌜🌛 Moonwell Morpho Earn

A [Clawdbot](https://github.com/clawdbot/clawdbot) / [OpenClaw](https://openclaw.ai) skill for earning yield on USDC via the **Moonwell Flagship USDC vault** on [Morpho](https://morpho.org) (Base network).

## What It Does

This skill enables AI agents to:

- **Deposit USDC** into the Moonwell vault to earn yield
- **Monitor positions** with beautiful formatted reports
- **Auto-compound rewards** (WELL + MORPHO tokens → USDC → reinvest)
- **Withdraw** funds when needed
- **Smart scheduling** — compound frequency adapts to deposit size

## Vault Details

| Property | Value |
|----------|-------|
| **Vault** | Moonwell Flagship USDC |
| **Address** | `0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca` |
| **Chain** | Base (8453) |
| **Asset** | USDC |
| **Current APY** | ~4-5% base + ~3% in rewards |

## Installation

### For Clawdbot Users

```bash
# Clone to your skills directory
cd ~/clawd/skills
git clone https://github.com/moonwell-fi/openclaw-morpho-earn.git morpho-yield

# Install dependencies
cd morpho-yield/scripts
npm install

# Run interactive setup
npx tsx setup.ts
```

### For Other Agents

The skill can be adapted for any agent framework. The core scripts in `scripts/` are standalone TypeScript files using [viem](https://viem.sh) for Ethereum interaction.

## Quick Start

```bash
cd scripts

# 1. Configure wallet and preferences
npx tsx setup.ts

# 2. Check vault status and APY
npx tsx status.ts

# 3. Deposit USDC (requires USDC + ETH for gas on Base)
npx tsx deposit.ts 100

# 4. Check your position
npx tsx report.ts

# 5. Compound rewards when ready
npx tsx compound.ts
```

## Commands

| Command | Description |
|---------|-------------|
| `setup.ts` | Interactive setup wizard |
| `status.ts` | Check position, balances, and vault APY |
| `report.ts` | Generate formatted report (Telegram/Discord/plain/JSON) |
| `deposit.ts <amount>` | Deposit USDC into vault |
| `withdraw.ts <amount\|all>` | Withdraw USDC from vault |
| `rewards.ts` | Check claimable rewards |
| `rewards.ts claim` | Claim rewards from Merkl |
| `compound.ts` | Claim → Swap → Deposit (full auto-compound) |

## Reports

The skill generates beautiful reports for chat platforms:

```
🌜🌛 Moonwell Yield Report

📊 Position
├ Value: $1,234.56 USDC
├ Base APY: 4.09%
└ Total APY: ~7.59%

🔄 Recently Compounded
├ 310.68 WELL → $1.43 USDC
├ 0.91 MORPHO → $1.01 USDC
└ Total: +$2.44 reinvested

💰 Estimated Earnings
├ Daily: ~$0.26
└ Monthly: ~$7.80

⛽ Gas: ✅ 0.0021 ETH
🔗 Wallet: 0xc6d8...cdf5
```

## Smart Compound Scheduling

The skill automatically adjusts monitoring frequency based on position size:

| Deposit Size | Check Frequency | Rationale |
|--------------|-----------------|-----------|
| $10,000+ | Daily | Large positions accumulate meaningful rewards quickly |
| $1,000-$10,000 | Every 3 days | Balance gas costs vs reward accumulation |
| $100-$1,000 | Weekly | Small rewards need time to exceed gas costs |
| <$100 | Bi-weekly | Minimal positions, compound only when worthwhile |

## Configuration

Config files are stored in `~/.config/morpho-yield/`:

**config.json** — Wallet and RPC settings
```json
{
  "wallet": {
    "source": "file",
    "path": "~/.clawd/vault/morpho.key"
  },
  "rpc": "https://rpc.moonwell.fi/main/evm/8453"
}
```

**preferences.json** — Notification and compound settings
```json
{
  "reportFrequency": "weekly",
  "compoundThreshold": 0.50,
  "autoCompound": true
}
```

### Wallet Options

The skill supports multiple wallet sources:

1. **Private key file** (recommended for agents)
   ```json
   { "source": "file", "path": "~/.clawd/vault/morpho.key" }
   ```

2. **Environment variable**
   ```json
   { "source": "env", "env": "MORPHO_PRIVATE_KEY" }
   ```

3. **1Password** (requires `op` CLI)
   ```json
   { "source": "1password", "item": "Morpho Wallet" }
   ```

## Security Considerations

⚠️ **This skill manages real funds. Please review carefully:**

- Private keys are loaded at runtime and never logged or written by scripts
- All transactions show a preview before execution
- The wallet should be a dedicated hot wallet with limited funds
- Never store your main wallet's private key
- Review all script code before use — this is open source for transparency
- Gas (ETH) is required on Base for transactions

### Recommended Setup

1. Create a **dedicated wallet** just for this skill
2. Fund it with only what you're comfortable having in a hot wallet
3. Keep the private key in a secure location (encrypted file or 1Password)
4. Monitor the wallet's activity periodically

## Rewards

The Moonwell vault earns rewards beyond the base APY:

- **MORPHO** — Morpho protocol incentives (~1.5% APR)
- **WELL** — Moonwell governance token (~2% APR)

Rewards are distributed via [Merkl](https://merkl.xyz) and update approximately every 8 hours. The `compound.ts` script handles:

1. Claiming rewards from Merkl
2. Swapping tokens to USDC via [Odos](https://odos.xyz) aggregator
3. Depositing USDC back into the vault

## Dependencies

- Node.js 18+
- [viem](https://viem.sh) — Ethereum interaction
- [tsx](https://tsx.is) — TypeScript execution

## Links

- [Moonwell](https://moonwell.fi) — DeFi lending protocol
- [Morpho](https://morpho.org) — Lending optimizer
- [Vault on Morpho](https://app.morpho.org/vault?vault=0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca&network=base)
- [Clawdbot](https://github.com/clawdbot/clawdbot) — AI agent framework
- [ClawdHub](https://clawdhub.com) — Skill registry

## License

MIT

---

Built with 🌜🌛 by [Moonwell](https://moonwell.fi)
