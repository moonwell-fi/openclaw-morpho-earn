#!/usr/bin/env npx tsx
/**
 * Deposit USDC into Moonwell Flagship USDC vault
 * Usage: npx tsx deposit.ts <amount>
 * Example: npx tsx deposit.ts 100
 */

import {
  loadConfig,
  getClients,
  VAULT_ADDRESS,
  USDC_ADDRESS,
  VAULT_ABI,
  ERC20_ABI,
  formatUSDC,
  parseUSDC,
} from './config.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: npx tsx deposit.ts <amount>');
    console.log('Example: npx tsx deposit.ts 100');
    process.exit(1);
  }
  
  const amountArg = args[0];
  const depositAmount = parseUSDC(amountArg);
  
  if (depositAmount <= 0n) {
    console.error('❌ Amount must be greater than 0');
    process.exit(1);
  }
  
  const config = loadConfig();
  const { publicClient, walletClient, account } = getClients(config);
  
  console.log('🌜🌛 Moonwell Flagship USDC Vault — Deposit\n');
  console.log(`Wallet: ${account.address}`);
  console.log(`Amount: ${formatUSDC(depositAmount)} USDC\n`);
  
  // Check USDC balance
  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  
  if (usdcBalance < depositAmount) {
    console.error(`❌ Insufficient USDC balance`);
    console.error(`   Available: ${formatUSDC(usdcBalance)} USDC`);
    console.error(`   Required:  ${formatUSDC(depositAmount)} USDC`);
    process.exit(1);
  }
  
  // Check ETH for gas
  const ethBalance = await publicClient.getBalance({ address: account.address });
  if (ethBalance < BigInt(1e14)) { // 0.0001 ETH minimum
    console.error(`❌ Insufficient ETH for gas`);
    console.error(`   Available: ${(Number(ethBalance) / 1e18).toFixed(6)} ETH`);
    console.error(`   Need at least 0.0001 ETH for transactions`);
    process.exit(1);
  }
  
  // Preview shares to receive
  const expectedShares = await publicClient.readContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'previewDeposit',
    args: [depositAmount],
  });
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Transaction Preview');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Depositing:        ${formatUSDC(depositAmount)} USDC`);
  console.log(`Expected shares:   ${formatUSDC(expectedShares)} mwUSDC`);
  console.log(`USDC after:        ${formatUSDC(usdcBalance - depositAmount)} USDC`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Check current allowance
  const currentAllowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, VAULT_ADDRESS],
  });
  
  // Step 1: Approve if needed
  if (currentAllowance < depositAmount) {
    console.log('📝 Step 1/2: Approving USDC spend...');
    
    const approveHash = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, depositAmount],
    });
    
    console.log(`   Tx: ${approveHash}`);
    console.log('   Waiting for confirmation...');
    
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log('   ✅ Approved!\n');
  } else {
    console.log('📝 Step 1/2: USDC already approved ✅\n');
  }
  
  // Step 2: Deposit
  console.log('📝 Step 2/2: Depositing into vault...');
  
  const depositHash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'deposit',
    args: [depositAmount, account.address],
  });
  
  console.log(`   Tx: ${depositHash}`);
  console.log('   Waiting for confirmation...');
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
  
  if (receipt.status === 'success') {
    console.log('   ✅ Deposit successful!\n');
    
    // Get updated position
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
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Deposit Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total shares:      ${formatUSDC(newShares)} mwUSDC`);
    console.log(`Position value:    ${formatUSDC(positionValue)} USDC`);
    console.log(`View on BaseScan:  https://basescan.org/tx/${depositHash}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } else {
    console.error('   ❌ Transaction failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
