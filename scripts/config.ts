import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Moonwell Flagship USDC Vault on Base
export const VAULT_ADDRESS = '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca' as Address;
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
export const USDC_DECIMALS = 6;

// ERC20 ABI (minimal)
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

// ERC4626 Vault ABI (minimal for Morpho vaults)
export const VAULT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    name: 'redeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'shares', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'owner', type: 'address' },
    ],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'convertToShares',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'previewDeposit',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'previewRedeem',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalAssets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'asset',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

interface WalletConfig {
  source: 'env' | '1password' | 'file';
  env_var?: string;
  item?: string;
  field?: string;
  path?: string;
  encrypted?: boolean;
}

interface Config {
  wallet: WalletConfig;
  rpc?: string;
}

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(process.env.HOME || '', p.slice(2));
  }
  return p;
}

export function loadConfig(): Config {
  const configPath = expandPath('~/.config/morpho-yield/config.json');
  
  if (!existsSync(configPath)) {
    console.error('❌ Config not found at ~/.config/morpho-yield/config.json');
    console.error('   See references/setup.md for configuration instructions.');
    process.exit(1);
  }
  
  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Config;
  return config;
}

export function getPrivateKey(config: Config): Hex {
  const { wallet } = config;
  
  switch (wallet.source) {
    case 'env': {
      const key = process.env[wallet.env_var || 'MORPHO_PRIVATE_KEY'];
      if (!key) {
        console.error(`❌ Environment variable ${wallet.env_var || 'MORPHO_PRIVATE_KEY'} not set`);
        process.exit(1);
      }
      return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
    }
    
    case '1password': {
      const item = wallet.item || 'Morpho Bot Wallet';
      const field = wallet.field || 'private_key';
      try {
        const key = execSync(`op read "op://${item}/${field}"`, { encoding: 'utf-8' }).trim();
        return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
      } catch (e) {
        console.error('❌ Failed to read from 1Password. Is the CLI installed and authenticated?');
        console.error('   Run: op signin');
        process.exit(1);
      }
    }
    
    case 'file': {
      const keyPath = expandPath(wallet.path || '~/.clawd/vault/morpho.key');
      if (!existsSync(keyPath)) {
        console.error(`❌ Key file not found: ${keyPath}`);
        process.exit(1);
      }
      const key = readFileSync(keyPath, 'utf-8').trim();
      return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
    }
    
    default:
      console.error(`❌ Unknown wallet source: ${wallet.source}`);
      process.exit(1);
  }
}

export function getClients(config: Config) {
  const privateKey = getPrivateKey(config);
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = config.rpc || 'https://mainnet.base.org';
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
  
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });
  
  return { publicClient, walletClient, account };
}

export function formatUSDC(amount: bigint): string {
  const num = Number(amount) / 1e6;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function parseUSDC(amount: string): bigint {
  const num = parseFloat(amount);
  return BigInt(Math.floor(num * 1e6));
}
