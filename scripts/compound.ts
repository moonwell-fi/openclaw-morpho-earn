#!/usr/bin/env npx tsx
/**
 * Auto-compound: Swap reward tokens to USDC and deposit into vault
 * Usage: npx tsx compound.ts
 * 
 * This script:
 * 1. Checks for claimable rewards and claims them
 * 2. Swaps reward tokens (MORPHO, WELL, etc.) to USDC via Odos aggregator
 * 3. Deposits the USDC into the Moonwell vault
 */

import {
  loadConfig,
  getClients,
  VAULT_ADDRESS,
  USDC_ADDRESS,
  VAULT_ABI,
  ERC20_ABI,
  formatUSDC,
} from './config.js';
import { type Address, type Hex, formatUnits } from 'viem';

// Common token addresses on Base
const WELL_ADDRESS = '0xA88594D404727625A9437C3f886C7643872296AE' as Address;
const MORPHO_ADDRESS = '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842' as Address;

// Odos Router V2 on Base
const ODOS_ROUTER = '0x19cEeAd7105607Cd444F5ad10dd51356436095a1' as Address;

// Merkl Distributor on Base
const MERKL_DISTRIBUTOR = '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae' as Address;
const BASE_CHAIN_ID = 8453;

const MERKL_ABI = [
  {
    inputs: [
      { name: 'users', type: 'address[]' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'proofs', type: 'bytes32[][]' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface TokenReward {
  token: Address;
  symbol: string;
  decimals: number;
  total: bigint;
  claimed: bigint;
  claimable: bigint;
  proofs: Hex[];
}

interface OdosQuoteResponse {
  pathId: string;
  outAmounts: string[];
  gasEstimate: number;
  outValues: number[];
}

interface OdosAssembleResponse {
  transaction: {
    to: string;
    data: string;
    value: string;
    gas: number;
  };
  outputTokens: Array<{ amount: string }>;
}

async function fetchRewards(userAddress: string): Promise<TokenReward[]> {
  const url = `https://api.merkl.xyz/v4/users/${userAddress}/rewards?chainId=${BASE_CHAIN_ID}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Merkl API error: ${response.status}`);
  }
  
  interface MerklReward {
    chain: { id: number };
    rewards: Array<{
      token: { address: string; symbol: string; decimals: number };
      amount: string;
      claimed: string;
      proofs: string[];
    }>;
  }
  
  const data = await response.json() as MerklReward[];
  const rewards: TokenReward[] = [];
  
  for (const chainRewards of data) {
    if (chainRewards.chain.id !== BASE_CHAIN_ID) continue;
    
    for (const reward of chainRewards.rewards) {
      const total = BigInt(reward.amount);
      const claimed = BigInt(reward.claimed);
      const claimable = total - claimed;
      
      if (claimable > 0n) {
        rewards.push({
          token: reward.token.address as Address,
          symbol: reward.token.symbol,
          decimals: reward.token.decimals,
          total,
          claimed,
          claimable,
          proofs: reward.proofs as Hex[],
        });
      }
    }
  }
  
  return rewards;
}

async function getOdosQuote(
  tokenIn: Address,
  amountIn: bigint,
  tokenOut: Address,
  userAddress: Address
): Promise<OdosQuoteResponse | null> {
  const response = await fetch('https://api.odos.xyz/sor/quote/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chainId: BASE_CHAIN_ID,
      inputTokens: [{ tokenAddress: tokenIn, amount: amountIn.toString() }],
      outputTokens: [{ tokenAddress: tokenOut, proportion: 1 }],
      slippageLimitPercent: 1, // 1% slippage
      userAddr: userAddress,
    }),
  });
  
  if (!response.ok) {
    console.log(`  ⚠️ Odos quote failed: ${response.status}`);
    return null;
  }
  
  return response.json();
}

async function assembleOdosTransaction(
  pathId: string,
  userAddress: Address
): Promise<OdosAssembleResponse | null> {
  const response = await fetch('https://api.odos.xyz/sor/assemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAddr: userAddress,
      pathId,
      simulate: false,
    }),
  });
  
  if (!response.ok) {
    console.log(`  ⚠️ Odos assemble failed: ${response.status}`);
    return null;
  }
  
  return response.json();
}

async function getTokenBalance(
  publicClient: ReturnType<typeof getClients>['publicClient'],
  token: Address,
  owner: Address
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function main() {
  const config = loadConfig();
  const { publicClient, walletClient, account } = getClients(config);
  
  console.log('🌜🌛 Moonwell Vault — Auto-Compound (via Odos)\n');
  console.log(`Wallet: ${account.address}`);
  console.log(`Vault:  ${VAULT_ADDRESS}\n`);
  
  // Check ETH for gas
  const ethBalance = await publicClient.getBalance({ address: account.address });
  if (ethBalance < BigInt(5e14)) { // 0.0005 ETH minimum for multiple txs
    console.error(`❌ Insufficient ETH for gas`);
    console.error(`   Available: ${(Number(ethBalance) / 1e18).toFixed(6)} ETH`);
    console.error(`   Recommended: at least 0.0005 ETH for compound operations`);
    process.exit(1);
  }
  
  // Step 1: Check and claim rewards
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 1: Check & Claim Rewards');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const rewards = await fetchRewards(account.address);
  
  if (rewards.length > 0) {
    console.log('Claimable rewards found:');
    for (const r of rewards) {
      console.log(`  ${formatUnits(r.claimable, r.decimals)} ${r.symbol}`);
    }
    
    // Claim rewards
    const users: Address[] = [];
    const tokens: Address[] = [];
    const amounts: bigint[] = [];
    const proofs: Hex[][] = [];
    
    for (const reward of rewards) {
      users.push(account.address);
      tokens.push(reward.token);
      amounts.push(reward.total);
      proofs.push(reward.proofs);
    }
    
    console.log('\nClaiming...');
    const claimHash = await walletClient.writeContract({
      address: MERKL_DISTRIBUTOR,
      abi: MERKL_ABI,
      functionName: 'claim',
      args: [users, tokens, amounts, proofs],
    });
    
    await publicClient.waitForTransactionReceipt({ hash: claimHash });
    console.log('✅ Rewards claimed!\n');
  } else {
    console.log('No pending rewards to claim.\n');
  }
  
  // Step 2: Check token balances and swap to USDC via Odos
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 2: Swap Rewards to USDC (via Odos)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Common reward tokens to check
  const rewardTokens = [
    { address: WELL_ADDRESS, symbol: 'WELL', decimals: 18 },
    { address: MORPHO_ADDRESS, symbol: 'MORPHO', decimals: 18 },
  ];
  
  for (const token of rewardTokens) {
    const balance = await getTokenBalance(publicClient, token.address, account.address);
    
    if (balance > 0n) {
      console.log(`Found ${formatUnits(balance, token.decimals)} ${token.symbol}`);
      
      // Get quote from Odos
      console.log(`  Getting Odos quote...`);
      const quote = await getOdosQuote(token.address, balance, USDC_ADDRESS, account.address);
      
      if (!quote) {
        console.log(`  ⚠️ Could not get quote, skipping ${token.symbol}`);
        continue;
      }
      
      const expectedOut = BigInt(quote.outAmounts[0]);
      console.log(`  Expected output: ${formatUSDC(expectedOut)} USDC`);
      
      // Skip if output is dust (< $0.01)
      if (expectedOut < 10000n) { // 0.01 USDC
        console.log(`  ⚠️ Output too small, skipping swap`);
        continue;
      }
      
      // Approve Odos router
      const allowance = await publicClient.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, ODOS_ROUTER],
      });
      
      if (allowance < balance) {
        console.log(`  Approving ${token.symbol} for Odos...`);
        const approveHash = await walletClient.writeContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ODOS_ROUTER, balance],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        console.log(`  ✅ Approved`);
      }
      
      // Assemble and execute swap
      console.log(`  Assembling swap transaction...`);
      const assembled = await assembleOdosTransaction(quote.pathId, account.address);
      
      if (!assembled) {
        console.log(`  ⚠️ Could not assemble transaction, skipping ${token.symbol}`);
        continue;
      }
      
      console.log(`  Executing swap...`);
      // Add 50% gas buffer - Odos often underestimates for complex routes
      const gasEstimate = BigInt(assembled.transaction.gas);
      const gasWithBuffer = gasEstimate + (gasEstimate * 50n / 100n);
      
      const swapHash = await walletClient.sendTransaction({
        to: assembled.transaction.to as Address,
        data: assembled.transaction.data as Hex,
        value: BigInt(assembled.transaction.value),
        gas: gasWithBuffer,
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash });
      
      if (receipt.status === 'success') {
        console.log(`  ✅ Swapped! Tx: ${swapHash}\n`);
      } else {
        console.log(`  ❌ Swap failed\n`);
      }
    }
  }
  
  // Step 3: Deposit all USDC into vault
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Step 3: Deposit USDC into Vault');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const usdcBalance = await getTokenBalance(publicClient, USDC_ADDRESS, account.address);
  
  if (usdcBalance === 0n) {
    console.log('No USDC available to deposit.');
    console.log('\n✅ Compound complete (no USDC to deposit)');
    return;
  }
  
  console.log(`USDC available: ${formatUSDC(usdcBalance)} USDC`);
  
  // Check vault allowance
  const vaultAllowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, VAULT_ADDRESS],
  });
  
  if (vaultAllowance < usdcBalance) {
    console.log('Approving USDC for vault...');
    const approveHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, usdcBalance],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log('✅ Approved!\n');
  }
  
  // Deposit into vault
  console.log(`Depositing ${formatUSDC(usdcBalance)} USDC...`);
  
  const depositHash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'deposit',
    args: [usdcBalance, account.address],
  });
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
  
  if (receipt.status === 'success') {
    // Get new position
    const newShares = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });
    
    const positionValue = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'convertToAssets',
      args: [newShares],
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Auto-Compound Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Deposited:         ${formatUSDC(usdcBalance)} USDC`);
    console.log(`Total position:    ${formatUSDC(positionValue)} USDC`);
    console.log(`Total shares:      ${formatUSDC(newShares)} mwUSDC`);
    console.log(`View on BaseScan:  https://basescan.org/tx/${depositHash}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } else {
    console.error('❌ Deposit failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
