import { readFileSync, existsSync, statSync, appendFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
  type SimulateContractReturnType,
  type TransactionReceipt,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Moonwell Flagship USDC Vault on Base
export const VAULT_ADDRESS = '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca' as Address;
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
export const USDC_DECIMALS = 6;

// Transaction settings
export const TX_TIMEOUT_MS = 120_000; // 2 minutes
export const TX_CONFIRMATIONS = 1;
export const API_RATE_LIMIT_MS = 300; // 300ms between API calls

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

export interface Config {
  wallet: WalletConfig;
  rpc?: string;
}

export function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(process.env.HOME || '', p.slice(2));
  }
  return p;
}

/**
 * Unified error handler for consistent error messages
 */
export function handleError(err: unknown, context: string): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ ${context}: ${message}`);
  process.exit(1);
}

/**
 * Rate limiting helper - sleep between API calls
 */
export const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Rate-limited fetch wrapper
 */
let lastApiCall = 0;
export async function rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastApiCall;
  if (elapsed < API_RATE_LIMIT_MS) {
    await sleep(API_RATE_LIMIT_MS - elapsed);
  }
  lastApiCall = Date.now();
  return fetch(url, options);
}

/**
 * Log a transaction for audit trail
 */
export function logTransaction(
  type: 'deposit' | 'withdraw' | 'approve' | 'claim' | 'swap' | 'compound',
  hash: string,
  details: Record<string, unknown>
): void {
  const logDir = expandPath('~/.config/morpho-yield/logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    hash,
    ...details,
  };
  
  const logPath = join(logDir, `${new Date().toISOString().slice(0, 7)}.jsonl`);
  appendFileSync(logPath, JSON.stringify(entry) + '\n');
}

/**
 * Load config with permission checks
 */
export function loadConfig(): Config {
  const configPath = expandPath('~/.config/morpho-yield/config.json');
  
  if (!existsSync(configPath)) {
    console.error('❌ Config not found at ~/.config/morpho-yield/config.json');
    console.error('   Run: npx tsx setup.ts');
    process.exit(1);
  }
  
  // Check file permissions (Unix only)
  try {
    const stats = statSync(configPath);
    const mode = stats.mode & 0o777;
    if (mode & 0o077) { // Readable by group or others
      console.warn('⚠️  Warning: Config file has loose permissions.');
      console.warn(`   Run: chmod 600 ${configPath}`);
    }
  } catch {
    // Ignore permission check errors on non-Unix systems
  }
  
  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Config;
  return config;
}

/**
 * Get private key with improved security handling
 */
export function getPrivateKey(config: Config): Hex {
  const { wallet } = config;
  let key: string | undefined;
  
  try {
    switch (wallet.source) {
      case 'env': {
        key = process.env[wallet.env_var || 'MORPHO_PRIVATE_KEY'];
        if (!key) {
          console.error(`❌ Environment variable ${wallet.env_var || 'MORPHO_PRIVATE_KEY'} not set`);
          process.exit(1);
        }
        break;
      }
      
      case '1password': {
        const item = wallet.item || 'Morpho Bot Wallet';
        const field = wallet.field || 'private_key';
        try {
          key = execSync(`op read "op://${item}/${field}"`, { encoding: 'utf-8' }).trim();
        } catch {
          console.error('❌ Failed to read from 1Password. Is the CLI installed and authenticated?');
          console.error('   Run: op signin');
          process.exit(1);
        }
        break;
      }
      
      case 'file': {
        const keyPath = expandPath(wallet.path || '~/.clawd/vault/morpho.key');
        if (!existsSync(keyPath)) {
          console.error(`❌ Key file not found: ${keyPath}`);
          process.exit(1);
        }
        
        // Check key file permissions
        try {
          const stats = statSync(keyPath);
          const mode = stats.mode & 0o777;
          if (mode & 0o077) {
            console.warn('⚠️  Warning: Key file has loose permissions.');
            console.warn(`   Run: chmod 600 ${keyPath}`);
          }
        } catch {
          // Ignore on non-Unix
        }
        
        key = readFileSync(keyPath, 'utf-8').trim();
        break;
      }
      
      default:
        console.error(`❌ Unknown wallet source: ${wallet.source}`);
        process.exit(1);
    }
    
    return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
  } finally {
    // Attempt to clear sensitive data from memory (limited effectiveness in JS)
    if (key) {
      key = '0'.repeat(key.length);
    }
  }
}

/**
 * Verify contracts are what we expect (protection against malicious RPC)
 */
export async function verifyContracts(publicClient: PublicClient): Promise<void> {
  // Verify vault asset is USDC
  const asset = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'asset',
  });
  
  if (asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    throw new Error(`Vault asset mismatch! Expected USDC (${USDC_ADDRESS}), got ${asset}`);
  }
  
  // Verify USDC decimals
  const decimals = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });
  
  if (decimals !== 6) {
    throw new Error(`USDC decimals mismatch! Expected 6, got ${decimals}`);
  }
  
  // Verify vault name contains expected identifier
  const vaultName = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'name',
  });
  
  if (!vaultName.toLowerCase().includes('moonwell') && !vaultName.toLowerCase().includes('usdc')) {
    console.warn(`⚠️  Vault name doesn't match expected: ${vaultName}`);
  }
}

/**
 * Wait for transaction with timeout
 */
export async function waitForTransaction(
  publicClient: PublicClient,
  hash: Hex,
  timeoutMs: number = TX_TIMEOUT_MS
): Promise<TransactionReceipt> {
  const receiptPromise = publicClient.waitForTransactionReceipt({
    hash,
    confirmations: TX_CONFIRMATIONS,
  });
  
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Transaction confirmation timeout after ${timeoutMs / 1000}s`)), timeoutMs)
  );
  
  return Promise.race([receiptPromise, timeoutPromise]);
}

/**
 * Simulate a contract call before execution
 */
export async function simulateAndWrite<TAbi extends readonly unknown[]>(
  publicClient: PublicClient,
  walletClient: WalletClient,
  params: {
    address: Address;
    abi: TAbi;
    functionName: string;
    args: readonly unknown[];
    account: Account;
  }
): Promise<Hex> {
  // Simulate first
  try {
    await publicClient.simulateContract({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
      account: params.account,
    } as any);
  } catch (simError) {
    const message = simError instanceof Error ? simError.message : String(simError);
    throw new Error(`Transaction simulation failed: ${message}`);
  }
  
  // Execute if simulation passed
  return walletClient.writeContract({
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
  } as any);
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

/**
 * Parse USDC amount without floating point precision issues
 */
export function parseUSDC(amount: string): bigint {
  // Remove any commas
  const cleaned = amount.replace(/,/g, '');
  
  // Split on decimal point
  const [whole, decimal = ''] = cleaned.split('.');
  
  // Pad or truncate decimal to 6 places
  const paddedDecimal = decimal.padEnd(6, '0').slice(0, 6);
  
  // Combine and convert to bigint
  const combined = whole + paddedDecimal;
  
  // Remove leading zeros but keep at least one digit
  const normalized = combined.replace(/^0+/, '') || '0';
  
  return BigInt(normalized);
}

/**
 * Validate USDC amount string format
 */
export function isValidUSDCAmount(amount: string): boolean {
  // Allow digits, optional single decimal point, optional commas
  return /^[\d,]+(\.\d{0,6})?$/.test(amount.trim());
}

/**
 * Fetch current vault APY from Morpho API
 */
export async function fetchVaultAPY(): Promise<number> {
  try {
    const response = await rateLimitedFetch('https://blue-api.morpho.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{
          vaultByAddress(address: "${VAULT_ADDRESS.toLowerCase()}", chainId: 8453) {
            state { netApy }
          }
        }`,
      }),
    });
    
    const data = await response.json() as {
      data?: { vaultByAddress?: { state?: { netApy?: number } } }
    };
    
    const apy = data?.data?.vaultByAddress?.state?.netApy;
    return typeof apy === 'number' ? apy * 100 : 0; // Convert to percentage
  } catch {
    return 0; // Return 0 if fetch fails, don't crash
  }
}
